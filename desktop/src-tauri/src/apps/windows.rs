//! Introspection of Windows apps for the blacklist.
//!
//! - Focus: `active-win-pos-rs` (frontmost window). We use the exe path
//!   as the identity key — Windows has no "bundle id".
//! - Installed list: PowerShell scans the Start menu shortcuts, resolves
//!   the target exe and extracts the icon as base64 PNG. Same principle as `mdfind` on
//!   macOS: Rust runs the native tool and reads its JSON output.
//!
//! The key is the lowercased exe path on both sides (focus + list),
//! so that a ticked app properly blocks its copies.

use std::process::Command;
use std::sync::OnceLock;

use serde::Deserialize;

use super::{InstalledApp, RunningApp};

/// Normalizes an exe path into a stable key: lowercase (Windows is
/// case-insensitive), to compare focus and list without false negatives.
fn exe_key(path: &str) -> String {
    path.to_lowercase()
}

/// Exe of the frontmost window (in practice, the one that just copied).
pub fn frontmost_bundle_id() -> Option<String> {
    let win = active_win_pos_rs::get_active_window().ok()?;
    let path = win.process_path.to_string_lossy();
    if path.is_empty() {
        // Fallback: process name if the path is empty.
        (!win.app_name.is_empty()).then(|| exe_key(&win.app_name))
    } else {
        Some(exe_key(&path))
    }
}

/// "Running" apps: not provided on Windows for now. The blacklist picker
/// relies on the installed list (`list_installed_apps`), which covers
/// the need. Enumerating active processes may come later if useful.
pub fn list_regular_apps() -> Vec<RunningApp> {
    Vec::new()
}

static INSTALLED_CACHE: OnceLock<Vec<InstalledApp>> = OnceLock::new();

/// Installed apps (name, exe, icon). Cached: the PowerShell scan runs
/// only once per session (spawning a process every time settings open
/// would be slow).
pub fn list_installed_apps() -> Vec<InstalledApp> {
    INSTALLED_CACHE.get_or_init(scan_installed).clone()
}

/// One item from the JSON produced by the PowerShell script.
#[derive(Deserialize)]
struct PsApp {
    name: String,
    path: String,
    icon: String,
}

fn scan_installed() -> Vec<InstalledApp> {
    // Scans the .lnk files of both Start menus (machine + user), resolves the
    // target .exe and outputs {name, path, icon(base64 PNG)} as compressed JSON.
    //
    // Thanks to Mephery for the brilliant idea (scanning the Start menu + extracting
    // the icon as base64, rather than the registry): https://github.com/Mephery
    const SCRIPT: &str = r#"
        Add-Type -AssemblyName System.Drawing
        $Shell = New-Object -ComObject WScript.Shell
        $Paths = @(
            "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        )
        $Apps = Get-ChildItem -Path $Paths -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $Target = $Shell.CreateShortcut($_.FullName).TargetPath
                if ($Target -and (Test-Path $Target) -and $Target.EndsWith(".exe")) {
                    $Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Target)
                    $Stream = New-Object System.IO.MemoryStream
                    $Bitmap = $Icon.ToBitmap()
                    $Bitmap.Save($Stream, [System.Drawing.Imaging.ImageFormat]::Png)
                    $Base64 = [Convert]::ToBase64String($Stream.ToArray())
                    $Bitmap.Dispose(); $Icon.Dispose(); $Stream.Dispose()
                    [PSCustomObject]@{
                        name = $_.BaseName
                        path = $Target
                        icon = "data:image/png;base64,$Base64"
                    }
                }
            } catch {}
        }
        if ($Apps) { $Apps | ConvertTo-Json -Compress } else { "[]" }
    "#;

    // `powershell` = Windows PowerShell 5, always present (unlike `pwsh`).
    // -NoProfile: no user profile (faster, deterministic).
    let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .output()
    else {
        return Vec::new();
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    // ConvertTo-Json returns a bare object (not an array) when there is only one item.
    let parsed: Vec<PsApp> = if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).unwrap_or_default()
    } else {
        serde_json::from_str::<PsApp>(trimmed).map(|a| vec![a]).unwrap_or_default()
    };

    let mut apps: Vec<InstalledApp> = parsed
        .into_iter()
        .map(|a| InstalledApp {
            name: a.name,
            bundle_id: exe_key(&a.path),
            icon: Some(a.icon),
        })
        .collect();

    // Dedup by key (the same exe may have several shortcuts).
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.bundle_id == b.bundle_id);
    apps
}
