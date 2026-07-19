mod apps;
mod blobz;
mod clip_sys;
mod clipboard;
mod crypto;
mod realtime;
mod seed;
mod store;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

/// Shared state. The encryption key lives here in memory (loaded from the Keychain),
/// never exposed to the frontend. `recently_written` = local anti-loop guard.
#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) key: Mutex<Option<[u8; 32]>>,
    pub(crate) recently_written: Mutex<HashSet<String>>,
    /// Pause mode: when true, the clipboard monitor no longer sends anything to the server.
    /// Session-only (defaults to false at launch); the frontend resyncs its state at boot.
    pub(crate) paused: AtomicBool,
    /// Bundle ids of blacklisted apps: their copies are never emitted.
    /// Loaded from the store at boot, editable from the settings.
    pub(crate) blacklist: Mutex<HashSet<String>>,
}

/// Config returned to the frontend for the transport (Echo/pusher-js) + HTTP calls.
/// Contains the device_token (bearer): needed for the Authorization header on the JS side.
/// The E2E encryption key, however, NEVER leaves Rust.
#[derive(Serialize)]
struct FrontendConfig {
    server_url: String,
    device_id: String,
    device_token: String,
    user_id: i64,
    reverb_app_key: String,
    reverb_host: String,
    reverb_port: u16,
    reverb_scheme: String,
}

fn hash_text(text: &str) -> String {
    let mut h = Sha256::new();
    h.update(text.as_bytes());
    format!("{:x}", h.finalize())
}

#[tauri::command]
fn is_configured() -> bool {
    store::is_configured()
}

/// Enables/disables pause mode (local copy not emitted to the server).
#[tauri::command]
fn set_paused(state: State<AppState>, paused: bool) {
    state.paused.store(paused, Ordering::Relaxed);
}

/// Generates a 12-word seed (first device). Never leaves the machine.
#[tauri::command]
fn generate_seed() -> Result<Vec<String>, String> {
    seed::generate()
}

/// Validates an entered seed (wordlist + checksum) before any pairing attempt.
#[tauri::command]
fn validate_seed(words: String) -> Result<(), String> {
    seed::validate(&words)
}

/// BIP39 wordlist, for input autocompletion.
#[tauri::command]
fn seed_wordlist() -> Vec<String> {
    seed::wordlist()
}

/// Copies the seed while marking it sensitive: history managers don't
/// archive it, and our monitor ignores it. An alternative to a screenshot, which
/// would end up in iCloud.
#[tauri::command]
fn copy_seed(words: Vec<String>) -> Result<(), String> {
    clipboard::write_concealed(&words.join(" "))
}

/// List of "regular" running apps (for the blacklist selector).
#[tauri::command]
fn list_running_apps() -> Vec<apps::RunningApp> {
    apps::list_regular_apps()
}

/// All installed apps (name + bundle id + icon), for the blacklist selector.
#[tauri::command]
async fn list_installed_apps() -> Vec<apps::InstalledApp> {
    // Spotlight scan + icon decoding: on a blocking thread so the IPC doesn't freeze.
    tauri::async_runtime::spawn_blocking(apps::list_installed_apps)
        .await
        .unwrap_or_default()
}

/// Current blacklist (bundle ids).
#[tauri::command]
fn get_blacklist() -> Vec<String> {
    store::load_config().map(|c| c.blacklist).unwrap_or_default()
}

/// Replaces the blacklist: persists to the store + updates the runtime state.
#[tauri::command]
fn set_blacklist(state: State<AppState>, bundle_ids: Vec<String>) -> Result<(), String> {
    if let Some(mut cfg) = store::load_config() {
        cfg.blacklist = bundle_ids.clone();
        store::save_config(&cfg)?;
    }
    *state.blacklist.lock().unwrap() = bundle_ids.into_iter().collect();
    Ok(())
}

/// First launch: pairs the device. Derives the key, stores it in the Keychain,
/// stores the token in the Keychain, writes the non-secret config, loads the key in memory.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn setup(
    state: State<AppState>,
    server_url: String,
    device_id: String,
    device_token: String,
    user_id: i64,
    passphrase: String,
    reverb_app_key: String,
    reverb_host: String,
    reverb_port: u16,
    reverb_scheme: String,
) -> Result<(), String> {
    // Defense in depth: we VALIDATE the seed (ASCII wordlist + checksum) before
    // deriving. Without this, a paste containing exotic Unicode could normalize
    // differently between Rust and JS (divergent to_lowercase) and produce
    // two different keys on Mac/phone, with a silent decryption failure.
    // Since the wordlist is purely ASCII, validating closes that door.
    seed::validate(&passphrase)?;

    // Single entry point for derivation: normalization lives here so the
    // key doesn't depend on input formatting (case, spaces). Mobile
    // must apply the exact same one, otherwise the keys silently diverge.
    let key = crypto::derive_key(&seed::normalize(&passphrase))?;

    store::save_encryption_key(&key)?;
    store::save_device_token(&device_token)?;
    store::save_config(&store::Config {
        server_url,
        device_id,
        user_id,
        reverb_app_key,
        reverb_host,
        reverb_port,
        reverb_scheme,
        blacklist: Vec::new(),
    })?;

    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

/// Returns the config + token to the frontend. Fails if not yet configured.
#[tauri::command]
fn get_config() -> Result<FrontendConfig, String> {
    let cfg = store::load_config().ok_or("not configured")?;
    let device_token = store::get_device_token()?;
    Ok(FrontendConfig {
        server_url: cfg.server_url,
        device_id: cfg.device_id,
        device_token,
        user_id: cfg.user_id,
        reverb_app_key: cfg.reverb_app_key,
        reverb_host: cfg.reverb_host,
        reverb_port: cfg.reverb_port,
        reverb_scheme: cfg.reverb_scheme,
    })
}

/// Decrypts a received clip (ciphertext + base64 nonce). Key taken from the state.
#[tauri::command]
fn decrypt_clip(
    state: State<AppState>,
    ciphertext: String,
    nonce: String,
) -> Result<String, String> {
    let guard = state.key.lock().unwrap();
    let key = guard.as_ref().ok_or("key not loaded (locked)")?;
    crypto::decrypt(key, &ciphertext, &nonce)
}

/// Writes to the macOS clipboard + marks the hash as "written by us"
/// (anti-loop: the emission step 3 will check this set before emitting).
#[tauri::command]
fn copy_to_clipboard(state: State<AppState>, text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
    clipboard
        .set_text(&text)
        .map_err(|e| format!("clipboard set: {e}"))?;

    state
        .recently_written
        .lock()
        .unwrap()
        .insert(hash_text(&text));
    Ok(())
}

/// Validates a blob_id BEFORE any use as a file path.
///
/// The blob_id comes from the server (so, in the E2E model, from an UNTRUSTED source:
/// compromised server or MITM). Without this check, a blob_id like
/// "../../Library/LaunchAgents/x.plist" would traverse out of the cache folder and
/// allow arbitrary file writes. The server generates UUIDs:
/// we require this format, which forbids any path separator.
fn require_uuid(blob_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(blob_id)
        .map(|_| ())
        .map_err(|_| "invalid blob_id".to_string())
}

/// Downloads an image blob + decrypts it (raw bytes, original format).
fn fetch_blob_bytes(state: &State<AppState>, blob_id: &str) -> Result<Vec<u8>, String> {
    let cfg = store::load_config().ok_or("not configured")?;
    let token = store::get_device_token()?;
    let key = { *state.key.lock().unwrap().as_ref().ok_or("key not loaded")? };

    let resp: serde_json::Value = ureq::get(&format!("{}/api/blob/{}", cfg.server_url, blob_id))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .call()
        .map_err(|e| format!("GET /blob: {e}"))?
        .into_json()
        .map_err(|e| format!("blob json: {e}"))?;

    let data = resp["data"].as_str().ok_or("blob data missing")?;
    let nonce = resp["nonce"].as_str().ok_or("blob nonce missing")?;
    let packed = crypto::decrypt_bytes(&key, data, nonce).map_err(|e| format!("decrypt_bytes: {e}"))?;
    Ok(blobz::decompress(&packed))
}

/// Local path (disk cache) of the decrypted image. Downloads + decrypts + writes
/// ONLY once; afterwards the file is reused (served via the file:///asset protocol).
/// Zero base64 in RAM on the JS side, zero re-download.
#[tauri::command]
async fn cache_image(state: State<'_, AppState>, blob_id: String) -> Result<String, String> {
    require_uuid(&blob_id)?;
    // `.png` extension so the asset protocol serves image/png (WebView2/Windows
    // won't render an <img> served as octet-stream; macOS WKWebView sniffs instead).
    let path = store::image_cache_dir()?.join(format!("{blob_id}.png"));
    if !path.exists() {
        let bytes = fetch_blob_bytes(&state, &blob_id)?;
        std::fs::write(&path, &bytes).map_err(|e| format!("write cache: {e}"))?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Copies a FILE (by blob) to the clipboard: writes the decrypted bytes
/// to a temporary file with its real name, then puts the reference (file-url) on the
/// clipboard → pasteable in the Finder / apps.
#[tauri::command]
async fn copy_file(state: State<'_, AppState>, blob_id: String, name: String) -> Result<(), String> {
    require_uuid(&blob_id)?;
    // The name comes from a decrypted clip (source authenticated by the key), but we
    // keep only the final component: no separator, no ".." remains.
    let name = std::path::Path::new(&name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty() && n != "." && n != "..")
        .unwrap_or_else(|| "file".to_string());
    let cache = store::image_cache_dir()?.join(&blob_id);
    let raw = if cache.exists() {
        std::fs::read(&cache).map_err(|e| format!("read cache: {e}"))?
    } else {
        let bytes = fetch_blob_bytes(&state, &blob_id)?;
        let _ = std::fs::write(&cache, &bytes);
        bytes
    };

    // Temporary file with the real name (so the paste keeps the right name).
    let dir = std::env::temp_dir().join("mimoe-paste");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir tmp: {e}"))?;
    let tmp = dir.join(&name);
    std::fs::write(&tmp, &raw).map_err(|e| format!("write tmp: {e}"))?;

    // Anti-loop: don't re-emit what we just wrote.
    state
        .recently_written
        .lock()
        .unwrap()
        .insert(hash_text_bytes(&raw));

    clipboard::set_pasteboard_file(&tmp.to_string_lossy())
}

/// Removes from the disk cache the images no longer in the current history
/// (best-effort): prevents the cache from growing indefinitely.
#[tauri::command]
fn prune_image_cache(keep: Vec<String>) -> Result<(), String> {
    let dir = store::image_cache_dir()?;
    let keep: HashSet<String> = keep.into_iter().collect();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            // Cache names may carry a `.png` extension (images); compare on the
            // blob id (file stem), which is what `keep` holds.
            let path = e.path();
            let id = path.file_stem().and_then(|s| s.to_str());
            if let Some(id) = id {
                if !keep.contains(id) {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }
    Ok(())
}

/// Copies an image (by blob_id) to the clipboard, from the disk cache if
/// present (otherwise downloads). Decoding happens on the Rust side: no large base64
/// passes through the IPC → instant copy.
#[tauri::command]
async fn copy_image_cached(state: State<'_, AppState>, blob_id: String) -> Result<(), String> {
    require_uuid(&blob_id)?;
    let path = store::image_cache_dir()?.join(format!("{blob_id}.png"));
    let raw = if path.exists() {
        std::fs::read(&path).map_err(|e| format!("read cache: {e}"))?
    } else {
        let bytes = fetch_blob_bytes(&state, &blob_id)?;
        let _ = std::fs::write(&path, &bytes);
        bytes
    };

    let img = image::load_from_memory(&raw)
        .map_err(|e| format!("decode image: {e}"))?
        .to_rgba8();
    let (w, h) = (img.width(), img.height());
    let bytes = img.into_raw();

    state
        .recently_written
        .lock()
        .unwrap()
        .insert(hash_text_bytes(&bytes));

    let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: std::borrow::Cow::Owned(bytes),
        })
        .map_err(|e| format!("set image: {e}"))?;
    Ok(())
}

fn hash_text_bytes(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

/// Opens/focuses the history window (called from tray or hotkey).
fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Hides the window (Esc / after copy-back, Raycast style).
#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Unpairs: clears config + secrets, wipes the key in memory.
#[tauri::command]
fn unpair(state: State<AppState>) -> Result<(), String> {
    store::clear()?;
    *state.key.lock().unwrap() = None;
    Ok(())
}

/// Updates the server URL + Reverb params (from the settings). Keeps device/key.
#[tauri::command]
fn update_server(
    server_url: String,
    reverb_app_key: String,
    reverb_host: String,
    reverb_port: u16,
    reverb_scheme: String,
) -> Result<(), String> {
    let mut cfg = store::load_config().ok_or("not configured")?;
    cfg.server_url = server_url;
    cfg.reverb_app_key = reverb_app_key;
    cfg.reverb_host = reverb_host;
    cfg.reverb_port = reverb_port;
    cfg.reverb_scheme = reverb_scheme;
    store::save_config(&cfg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CmdOrCtrl+Shift+V")
                .expect("invalid shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        show_window(app);
                    }
                })
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            is_configured,
            set_paused,
            generate_seed,
            validate_seed,
            seed_wordlist,
            copy_seed,
            list_running_apps,
            list_installed_apps,
            get_blacklist,
            set_blacklist,
            setup,
            get_config,
            decrypt_clip,
            copy_to_clipboard,
            cache_image,
            copy_image_cached,
            copy_file,
            prune_image_cache,
            hide_window,
            unpair,
            update_server,
        ])
        .setup(|app| {
            // App menu bar: no dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);


            // Load the key from the Keychain if already configured.
            if store::is_configured() {
                if let Ok(key) = store::get_encryption_key() {
                    let state = app.state::<AppState>();
                    *state.key.lock().unwrap() = Some(key);
                }
            }

            // Load the blacklist from the store (available from boot, even before the UI).
            if let Some(cfg) = store::load_config() {
                let state = app.state::<AppState>();
                *state.blacklist.lock().unwrap() = cfg.blacklist.into_iter().collect();
            }

            // Clipboard monitoring (emission). Idle while not configured.
            clipboard::start_monitor(app.handle().clone());

            // Real-time reception on a NATIVE thread (never frozen by the window hide).
            // Idle while not configured, then (re)connects on its own.
            realtime::start(app.handle().clone());

            // Closing the window = hiding it (app menu bar), not quitting.
            if let Some(w) = app.get_webview_window("main") {
                let wc = w.clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = wc.hide();
                    }
                });
            }

            // Menu bar icon with right-click menu.
            let quit = MenuItem::with_id(app, "quit", "Quit Mimoe", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open history", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => show_window(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
