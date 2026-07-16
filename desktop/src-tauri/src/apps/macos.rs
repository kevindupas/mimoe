//! Introspection of macOS apps for the blacklist.
//!
//! - Frontmost app / running apps: via NSWorkspace (AppKit). These functions
//!   are called from SYNC commands (main thread) or the monitor.
//! - Installed apps list + icons: 100% pure Rust (mdfind + plist + icns),
//!   NO AppKit → can run on a worker thread without freezing/hanging (AppKit requires
//!   the main thread, which was blocking the scan when run async).

use std::collections::HashSet;
use std::io::{BufReader, Cursor};
use std::process::Command;
use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use icns::{IconFamily, IconType};
use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};

use super::{InstalledApp, RunningApp};

// --- Running / frontmost apps (AppKit, main thread) ---

/// Bundle id of the frontmost app (in practice, the one that just copied).
pub fn frontmost_bundle_id() -> Option<String> {
    // SAFETY: shared NSWorkspace, read from the monitor thread.
    unsafe {
        let ws = NSWorkspace::sharedWorkspace();
        let app = ws.frontmostApplication()?;
        app.bundleIdentifier().map(|s| s.to_string())
    }
}

/// "Regular" apps (with a window/dock icon) currently running, sorted by name.
pub fn list_regular_apps() -> Vec<RunningApp> {
    let mut out = Vec::new();
    // SAFETY: shared NSWorkspace, iterating over an immutable snapshot.
    unsafe {
        let ws = NSWorkspace::sharedWorkspace();
        let apps = ws.runningApplications();
        for i in 0..apps.count() {
            let app = apps.objectAtIndex(i);
            if app.activationPolicy() != NSApplicationActivationPolicy::Regular {
                continue;
            }
            let (Some(name), Some(bid)) = (app.localizedName(), app.bundleIdentifier()) else {
                continue;
            };
            out.push(RunningApp {
                name: name.to_string(),
                bundle_id: bid.to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.bundle_id == b.bundle_id);
    out
}

// --- Installed apps + icons (pure Rust, worker thread OK) ---

static INSTALLED_CACHE: OnceLock<Vec<InstalledApp>> = OnceLock::new();

/// All installed apps (name, bundle id, icon). Cached: the scan
/// (Spotlight + icon decoding) runs only once per session.
pub fn list_installed_apps() -> Vec<InstalledApp> {
    INSTALLED_CACHE.get_or_init(scan_installed).clone()
}

fn scan_installed() -> Vec<InstalledApp> {
    let Ok(output) = Command::new("mdfind")
        .arg("kMDItemContentTypeTree == 'com.apple.application-bundle'c")
        .output()
    else {
        return Vec::new();
    };
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut apps = Vec::new();
    let mut seen = HashSet::new();
    for path in stdout.lines().filter(|l| !l.is_empty()) {
        if !is_user_app(path) {
            continue;
        }
        let Some(info) = read_bundle_info(path) else {
            continue;
        };
        if !seen.insert(info.bundle_id.clone()) {
            continue;
        }
        let icon = resolve_icns(path, info.icon_file.as_deref()).and_then(|p| decode_icns_png(&p));
        apps.push(InstalledApp {
            name: info.name,
            bundle_id: info.bundle_id,
            icon,
        });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

/// A genuine "user" app: inside an Applications folder, and not a nested app
/// (a helper inside another .app, a framework, a system service…).
fn is_user_app(path: &str) -> bool {
    if path.matches(".app").count() != 1 {
        return false; // nested app / helper
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let roots = [
        "/Applications/".to_string(),
        "/System/Applications/".to_string(),
        format!("{home}/Applications/"),
    ];
    roots.iter().any(|r| path.starts_with(r))
}

struct BundleInfo {
    name: String,
    bundle_id: String,
    icon_file: Option<String>,
}

/// Reads Contents/Info.plist: bundle id (required), display name, icon file.
fn read_bundle_info(app_path: &str) -> Option<BundleInfo> {
    let plist_path = format!("{app_path}/Contents/Info.plist");
    let value = plist::Value::from_file(&plist_path).ok()?;
    let dict = value.as_dictionary()?;

    let bundle_id = dict.get("CFBundleIdentifier")?.as_string()?.to_string();

    let name = dict
        .get("CFBundleDisplayName")
        .and_then(|v| v.as_string())
        .or_else(|| dict.get("CFBundleName").and_then(|v| v.as_string()))
        .map(String::from)
        .unwrap_or_else(|| {
            std::path::Path::new(app_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| bundle_id.clone())
        });

    let icon_file = dict
        .get("CFBundleIconFile")
        .and_then(|v| v.as_string())
        .map(String::from);

    Some(BundleInfo {
        name,
        bundle_id,
        icon_file,
    })
}

/// Finds the bundle's .icns: named (CFBundleIconFile) → AppIcon.icns → first .icns.
fn resolve_icns(app_path: &str, icon_file: Option<&str>) -> Option<std::path::PathBuf> {
    let res = std::path::Path::new(app_path).join("Contents/Resources");

    if let Some(f) = icon_file {
        let stem = f.strip_suffix(".icns").unwrap_or(f);
        let p = res.join(format!("{stem}.icns"));
        if p.exists() {
            return Some(p);
        }
    }
    let app_icon = res.join("AppIcon.icns");
    if app_icon.exists() {
        return Some(app_icon);
    }
    std::fs::read_dir(&res)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().map_or(false, |e| e == "icns"))
}

/// Decodes an .icns → 36px PNG as a data-URI. None if unreadable.
fn decode_icns_png(icns_path: &std::path::Path) -> Option<String> {
    let file = BufReader::new(std::fs::File::open(icns_path).ok()?);
    let family = IconFamily::read(file).ok()?;

    // RGBA types from the best fit to the largest (we then resize to 36px).
    const PREF: [IconType; 5] = [
        IconType::RGBA32_128x128,
        IconType::RGBA32_256x256,
        IconType::RGBA32_64x64,
        IconType::RGBA32_512x512,
        IconType::RGBA32_32x32,
    ];
    let ty = PREF
        .into_iter()
        .find(|t| family.available_icons().contains(t))?;
    let icon = family.get_icon_with_type(ty).ok()?;

    let rgba = image::RgbaImage::from_raw(icon.width(), icon.height(), icon.data().to_vec())?;
    let small = image::DynamicImage::ImageRgba8(rgba).resize(
        36,
        36,
        image::imageops::FilterType::Lanczos3,
    );
    let mut buf = Vec::new();
    small
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .ok()?;
    Some(format!("data:image/png;base64,{}", B64.encode(buf)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scan_smoke() {
        let t = std::time::Instant::now();
        let apps = scan_installed();
        let with_icon = apps.iter().filter(|a| a.icon.is_some()).count();
        eprintln!(
            "apps={} with_icon={} elapsed={:?}",
            apps.len(),
            with_icon,
            t.elapsed()
        );
        for a in apps.iter().take(5) {
            eprintln!("  {} [{}] icon={}", a.name, a.bundle_id, a.icon.is_some());
        }
        assert!(!apps.is_empty());
    }
}
