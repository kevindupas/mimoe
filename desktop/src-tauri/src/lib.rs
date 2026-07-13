mod clipboard;
mod crypto;
mod realtime;
mod store;

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

/// Etat partage. La cle de chiffrement vit ici en memoire (chargee du Keychain),
/// jamais exposee au frontend. `recently_written` = anti-boucle local.
#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) key: Mutex<Option<[u8; 32]>>,
    pub(crate) recently_written: Mutex<HashSet<String>>,
}

/// Config renvoyee au frontend pour le transport (Echo/pusher-js) + appels HTTP.
/// Contient le device_token (bearer) : necessaire au header Authorization cote JS.
/// La cle de chiffrement E2E, elle, ne quitte JAMAIS Rust.
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

/// Premier lancement : appaire l'appareil. Derive la cle, la stocke au Keychain,
/// stocke le token au Keychain, ecrit la config non-secrete, charge la cle en memoire.
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
    let key = crypto::derive_key(&passphrase)?;

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
    })?;

    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

/// Renvoie la config + token au frontend. Echoue si pas encore configure.
#[tauri::command]
fn get_config() -> Result<FrontendConfig, String> {
    let cfg = store::load_config().ok_or("non configure")?;
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

/// Dechiffre un clip recu (ciphertext + nonce base64). Cle prise dans le state.
#[tauri::command]
fn decrypt_clip(
    state: State<AppState>,
    ciphertext: String,
    nonce: String,
) -> Result<String, String> {
    let guard = state.key.lock().unwrap();
    let key = guard.as_ref().ok_or("cle non chargee (verrouille)")?;
    crypto::decrypt(key, &ciphertext, &nonce)
}

/// Ecrit dans le presse-papier macOS + marque le hash comme "ecrit par nous"
/// (anti-boucle : l'etape 3 emission verifiera ce set avant d'emettre).
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

/// Telecharge un blob image, le dechiffre, renvoie le PNG en base64 (pour <img>).
#[tauri::command]
fn fetch_image(state: State<AppState>, blob_id: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    let cfg = store::load_config().ok_or("non configure")?;
    let token = store::get_device_token()?;
    let key = { *state.key.lock().unwrap().as_ref().ok_or("cle non chargee")? };

    let resp: serde_json::Value = ureq::get(&format!("{}/api/blob/{}", cfg.server_url, blob_id))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .call()
        .map_err(|e| format!("GET /blob: {e}"))?
        .into_json()
        .map_err(|e| format!("blob json: {e}"))?;

    let data = resp["data"].as_str().ok_or("blob data manquant")?;
    let nonce = resp["nonce"].as_str().ok_or("blob nonce manquant")?;
    let png = crypto::decrypt_bytes(&key, data, nonce)?;
    Ok(B64.encode(png))
}

/// Ecrit une image (PNG base64) dans le presse-papier + marque anti-boucle.
#[tauri::command]
fn copy_image(state: State<AppState>, png_b64: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    let png = B64.decode(&png_b64).map_err(|e| format!("base64: {e}"))?;
    let img = image::load_from_memory(&png)
        .map_err(|e| format!("decode png: {e}"))?
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

/// Ouvre/focus la fenetre d'historique (appel depuis tray ou hotkey).
fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Masque la fenetre (Echap / apres recopie, facon Raycast).
#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Desappaire : efface config + secrets, vide la cle en memoire.
#[tauri::command]
fn unpair(state: State<AppState>) -> Result<(), String> {
    store::clear()?;
    *state.key.lock().unwrap() = None;
    Ok(())
}

/// Met a jour l'URL serveur + params Reverb (depuis les reglages). Garde device/cle.
#[tauri::command]
fn update_server(
    server_url: String,
    reverb_app_key: String,
    reverb_host: String,
    reverb_port: u16,
    reverb_scheme: String,
) -> Result<(), String> {
    let mut cfg = store::load_config().ok_or("non configure")?;
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CmdOrCtrl+Shift+V")
                .expect("shortcut invalide")
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
            setup,
            get_config,
            decrypt_clip,
            copy_to_clipboard,
            fetch_image,
            copy_image,
            hide_window,
            unpair,
            update_server,
        ])
        .setup(|app| {
            // App menu bar : pas d'icone dock.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);


            // Charge la cle depuis le Keychain si deja configure.
            if store::is_configured() {
                if let Ok(key) = store::get_encryption_key() {
                    let state = app.state::<AppState>();
                    *state.key.lock().unwrap() = Some(key);
                }
            }

            // Surveillance du presse-papier (emission). Idle tant que non configure.
            clipboard::start_monitor(app.handle().clone());

            // Reception temps reel en thread NATIF (jamais gele par le hide de fenetre).
            // Idle tant que non configure, se (re)connecte tout seul ensuite.
            realtime::start(app.handle().clone());

            // Fermer la fenetre = la masquer (app menu bar), pas quitter.
            if let Some(w) = app.get_webview_window("main") {
                let wc = w.clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = wc.hide();
                    }
                });
            }

            // Icone menu bar avec menu clic-droit.
            let quit = MenuItem::with_id(app, "quit", "Quitter Clipd", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Ouvrir l'historique", true, None::<&str>)?;
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
