//! Emission: watches the clipboard and emits encrypted changes.
//!
//! Orchestration COMMON to all platforms. The 5 low-level operations
//! that differ from one OS to another (sequence number, text read + sensitive
//! flag, referenced file path, sensitive write, file
//! reference) live in `clip_sys`, one impl per platform.
//!
//! The "sensitive" flag (password manager) is detected via
//! `clip_sys::read` and the corresponding content is never encrypted or sent.
//!
//! Anti-loop: before emitting, we check the `recently_written` set. If the
//! content hash is in it, WE are the ones who just wrote it (copied back from
//! the history) -> we consume the entry and emit nothing.

use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::clip_sys;
use crate::{crypto, store, AppState};

const POLL_MS: u64 = 500;

fn hash_text(text: &str) -> String {
    hash_bytes(text.as_bytes())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

/// Writes text marked "sensitive": history managers don't
/// archive it, and our own monitor ignores it. Used to copy the seed
/// without scattering it into a plaintext history. Delegates to the platform primitive.
pub fn write_concealed(text: &str) -> Result<(), String> {
    clip_sys::write_concealed(text)
}

/// Reads an image from the clipboard (raw data, e.g. a direct capture).
/// Returns (hash, encoded PNG, mime, name). The raw data is RGBA → PNG.
fn read_clipboard_image() -> Option<(String, Vec<u8>, &'static str, String)> {
    let mut clip = arboard::Clipboard::new().ok()?;
    let img = clip.get_image().ok()?;
    let hash = hash_bytes(&img.bytes);
    let png = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.bytes.into_owned())?;
    let mut out = Vec::new();
    image::DynamicImage::ImageRgba8(png)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .ok()?;
    // No source file (raw data) → name generated with the date.
    let name = format!("Capture {}.png", chrono::Local::now().format("%Y-%m-%d at %H.%M.%S"));
    Some((hash, out, "image/png", name))
}

/// Mime for an extension (broad). Default: application/octet-stream.
fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        // images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "tiff" | "tif" => "image/tiff",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "heic" => "image/heic",
        // documents
        "pdf" => "application/pdf",
        "csv" => "text/csv",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "xml" => "application/xml",
        "zip" => "application/zip",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // audio / video
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

fn is_image_mime(mime: &str) -> bool {
    mime.starts_with("image/") && mime != "image/svg+xml"
}

/// Max size of a synced file (beyond this: ignored).
const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// If the clipboard references a FILE (copied from the file explorer), we read
/// its RAW content (no re-encoding → original format, animated GIFs preserved) and
/// return (hash, bytes, mime, name, kind). kind = "image" or "file" depending on the mime.
fn read_file() -> Option<(String, Vec<u8>, &'static str, String, &'static str)> {
    let path = clip_sys::file_path()?; // real resolved path (with extension)
    let p = std::path::Path::new(&path);

    let meta = std::fs::metadata(&path).ok()?;
    if !meta.is_file() {
        return None; // copied folder -> ignore
    }
    if meta.len() > MAX_FILE_BYTES {
        eprintln!("[mimoe] file too large ({} MB), ignored", meta.len() / 1024 / 1024);
        return None;
    }

    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let mime = mime_for_ext(&ext);
    let kind = if is_image_mime(mime) { "image" } else { "file" };

    let bytes = std::fs::read(&path).ok()?;
    let hash = hash_bytes(&bytes);
    Some((hash, bytes, mime, name, kind))
}

/// Starts the monitoring thread. Idempotent at the app scope (called once at setup).
pub fn start_monitor(app: AppHandle) {
    thread::spawn(move || {
        // We start from the current sequence number: we don't emit pre-existing content at launch.
        let mut last_count = clip_sys::change_count();
        // Anti-duplicate: hash of the last emitted content. Copying the same text/image
        // again (changeCount increments but content identical) only sends once.
        let mut last_emitted: Option<String> = None;

        loop {
            thread::sleep(Duration::from_millis(POLL_MS));

            let count = clip_sys::change_count();
            if count == last_count {
                continue;
            }
            last_count = count;

            if !store::is_configured() {
                continue;
            }

            // Pause mode: we ignore this change (last_count already advanced -> no
            // catch-up on resume). Local copy works, nothing goes to the server.
            if app.state::<AppState>().paused.load(Ordering::Relaxed) {
                continue;
            }

            // Blacklist: if the frontmost app (the one that just copied) is
            // blacklisted, we ignore this copy.
            if let Some(bid) = crate::apps::frontmost_bundle_id() {
                if app.state::<AppState>().blacklist.lock().unwrap().contains(&bid) {
                    continue;
                }
            }

            let content = clip_sys::read();

            // Sensitive flag -> ignored by default (not encrypted, sent, or stored).
            if content.is_concealed {
                continue;
            }

            // Image file copied from the Finder: the clipboard only contains
            // the reference + the name + a generic icon. We read the REAL file and
            // emit it as an image (otherwise the name went out as text / the icon as image).
            // Copy of a FILE (Finder): image OR any other type (pdf, csv, mp3…).
            if let Some((hash, bytes, mime, name, kind)) = read_file() {
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue;
                }
                if let Err(e) = emit_blob(&app, &bytes, mime, &name, kind) {
                    eprintln!("[mimoe] file emission failed: {e}");
                } else {
                    last_emitted = Some(hash);
                }
                continue;
            }

            // RAW DATA image (direct capture). ONLY if it's NOT a
            // file copy (already handled above): otherwise arboard returns the ICON.
            if clip_sys::file_path().is_none() {
                if let Some((hash, png, mime, name)) = read_clipboard_image() {
                    if consume_written(&app, &hash) {
                        continue;
                    }
                    if last_emitted.as_deref() == Some(hash.as_str()) {
                        continue;
                    }
                    if let Err(e) = emit_blob(&app, &png, mime, &name, "image") {
                        eprintln!("[mimoe] image emission failed: {e}");
                    } else {
                        last_emitted = Some(hash);
                    }
                    continue;
                }
            }

            // Otherwise: text.
            if let Some(text) = content.text {
                let hash = hash_text(&text);
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue; // same content copied again -> no duplicate
                }
                if let Err(e) = emit_clip(&app, &text) {
                    eprintln!("[mimoe] text emission failed: {e}");
                } else {
                    last_emitted = Some(hash);
                }
            }
        }
    });
}

/// Places a FILE reference on the clipboard (to paste elsewhere).
/// Delegates to the platform primitive.
pub fn set_pasteboard_file(path: &str) -> Result<(), String> {
    clip_sys::set_file(path)
}

/// Anti-loop: true if we just wrote this hash (to consume, don't emit).
fn consume_written(app: &AppHandle, hash: &str) -> bool {
    let state = app.state::<AppState>();
    let mut written = state.recently_written.lock().unwrap();
    written.remove(hash)
}

/// Encrypts then POST /clip to the server.
fn emit_clip(app: &AppHandle, text: &str) -> Result<(), String> {
    let cfg = store::load_config().ok_or("not configured")?;
    let token = store::get_device_token()?;

    let key = {
        let state = app.state::<AppState>();
        let guard = state.key.lock().unwrap();
        *guard.as_ref().ok_or("key not loaded")?
    };

    let (ciphertext, nonce) = crypto::encrypt(&key, text)?;

    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let payload = serde_json::json!({
        "id": id,
        "origin_device_id": cfg.device_id,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "dedup_hash": crypto::dedup_fingerprint(&key, text.as_bytes()),
        "is_sensitive": false,
        "created_at": created_at,
    });

    let url = format!("{}/api/clip", cfg.server_url);
    ureq::post(&url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip: {e}"))?;

    // Instant display on THIS Mac (the origin doesn't receive its own clip via WS).
    let _ = app.emit(
        "clip-local",
        serde_json::json!({
            "id": id, "kind": "text", "text": text,
            "origin_device_id": cfg.device_id, "created_at": created_at,
        }),
    );

    Ok(())
}

/// Encrypts binary content (image or file, raw bytes), uploads it as a blob,
/// then POST /clip with kind + mime + name (encrypted) to render it on the clients.
fn emit_blob(app: &AppHandle, bytes: &[u8], mime: &str, name: &str, kind: &str) -> Result<(), String> {
    let cfg = store::load_config().ok_or("not configured")?;
    let token = store::get_device_token()?;
    let key = {
        let state = app.state::<AppState>();
        let guard = state.key.lock().unwrap();
        *guard.as_ref().ok_or("key not loaded")?
    };

    // 1. Compression (if useful) THEN encryption of the blob.
    let packed = crate::blobz::compress(bytes);
    let (blob_data, blob_nonce) = crypto::encrypt_bytes(&key, &packed)?;
    let blob_id = post_blob(&cfg.server_url, &token, &blob_data, &blob_nonce)?;

    // Local disk cache = RAW bytes (decompressed): no re-download at render time.
    if let Ok(dir) = store::image_cache_dir() {
        let _ = std::fs::write(dir.join(&blob_id), bytes);
    }

    // 2. Pointer clip (ciphertext = encrypted file name, displayed under the image).
    let (ciphertext, nonce) = crypto::encrypt(&key, name)?;
    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let payload = serde_json::json!({
        "id": id,
        "origin_device_id": cfg.device_id,
        "kind": kind,
        "blob_id": blob_id,
        "mime": mime,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "dedup_hash": crypto::dedup_fingerprint(&key, bytes),
        "is_sensitive": false,
        "created_at": created_at,
    });
    ureq::post(&format!("{}/api/clip", cfg.server_url))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip {kind}: {e}"))?;

    // Instant display on THIS Mac.
    let _ = app.emit(
        "clip-local",
        serde_json::json!({
            "id": id, "kind": kind, "blob_id": blob_id, "mime": mime, "text": name,
            "origin_device_id": cfg.device_id, "created_at": created_at,
        }),
    );
    Ok(())
}

/// Uploads an encrypted blob. Returns its id.
fn post_blob(server_url: &str, token: &str, data: &str, nonce: &str) -> Result<String, String> {
    let resp: serde_json::Value = ureq::post(&format!("{server_url}/api/blob"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(serde_json::json!({ "data": data, "nonce": nonce }))
        .map_err(|e| format!("POST /blob: {e}"))?
        .into_json()
        .map_err(|e| format!("blob json: {e}"))?;
    resp["id"].as_str().map(String::from).ok_or("blob id missing".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Detection of the "sensitive" marker is now tested per platform
    // in clip_sys (the format differs: ConcealedType on macOS, Win32 format excluded).

    /// Full roundtrip emission -> server -> fetch -> decryption, with real
    /// crypto. Gated: only runs if MIMOE_TEST_TOKEN + MIMOE_TEST_DEVICE + URL are
    /// set AND a server is running. Otherwise skipped.
    #[test]
    fn emit_then_fetch_decrypts() {
        let (Ok(token), Ok(device), Ok(url)) = (
            std::env::var("MIMOE_TEST_TOKEN"),
            std::env::var("MIMOE_TEST_DEVICE"),
            std::env::var("MIMOE_TEST_URL"),
        ) else {
            eprintln!("skip: test env not set");
            return;
        };

        let key = crypto::derive_key("integration-pass").unwrap();
        let secret = "creds SSH ultra secretes 42";
        let (ciphertext, nonce) = crypto::encrypt(&key, secret).unwrap();
        let id = Uuid::new_v4().to_string();

        let payload = serde_json::json!({
            "id": id,
            "origin_device_id": device,
            "ciphertext": ciphertext,
            "nonce": nonce,
            "is_sensitive": false,
            "created_at": chrono::Utc::now().to_rfc3339(),
        });

        ureq::post(&format!("{url}/api/clip"))
            .set("Authorization", &format!("Bearer {token}"))
            .set("Accept", "application/json")
            .send_json(payload)
            .expect("POST /clip");

        let body: serde_json::Value = ureq::get(&format!("{url}/api/clips"))
            .set("Authorization", &format!("Bearer {token}"))
            .set("Accept", "application/json")
            .call()
            .expect("GET /clips")
            .into_json()
            .unwrap();

        let clip = body["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .expect("clip present in history");

        let decrypted = crypto::decrypt(
            &key,
            clip["ciphertext"].as_str().unwrap(),
            clip["nonce"].as_str().unwrap(),
        )
        .unwrap();

        assert_eq!(decrypted, secret, "the server relays decryptable ciphertext");
    }
}

