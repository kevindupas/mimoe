//! Emission : surveille le presse-papier macOS et emet les changements chiffres.
//!
//! Lecture NATIVE de NSPasteboard (pas arboard) pour deux raisons :
//!   1. `changeCount` : detecte un changement sans comparer le texte.
//!   2. Type `org.nspasteboard.ConcealedType` : detecte les copies marquees
//!      "sensibles" par les gestionnaires de mots de passe -> on les IGNORE.
//!
//! Anti-boucle : avant d'emettre, on verifie le set `recently_written`. Si le
//! hash du contenu y est, c'est NOUS qui venons de l'ecrire (recopie depuis
//! l'historique) -> on consomme l'entree et on n'emet rien.

use std::thread;
use std::time::Duration;

use objc2_app_kit::NSPasteboard;
use objc2_foundation::NSString;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{crypto, store, AppState};

const CONCEALED_TYPE: &str = "org.nspasteboard.ConcealedType";
// UTI du texte brut = valeur de NSPasteboardTypeString.
const TEXT_UTI: &str = "public.utf8-plain-text";
const POLL_MS: u64 = 500;

struct Content {
    text: Option<String>,
    is_concealed: bool,
}

fn hash_text(text: &str) -> String {
    hash_bytes(text.as_bytes())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

/// Logique pure (testable) : la liste des types du presse-papier contient-elle
/// le marqueur sensible ?
fn types_contain_concealed(types: &[String]) -> bool {
    types.iter().any(|t| t == CONCEALED_TYPE)
}

/// Lit le presse-papier : flag sensible + texte (None si pas de texte).
fn read_pasteboard() -> Content {
    // SAFETY : NSPasteboard general est accessible depuis n'importe quel thread pour lire.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();

        let mut type_names = Vec::new();
        if let Some(types) = pb.types() {
            for i in 0..types.count() {
                type_names.push(types.objectAtIndex(i).to_string());
            }
        }
        let is_concealed = types_contain_concealed(&type_names);

        let text = pb
            .stringForType(&NSString::from_str(TEXT_UTI))
            .map(|s| s.to_string())
            .filter(|t| !t.is_empty());

        Content { text, is_concealed }
    }
}

/// Lit une image du presse-papier. Renvoie (hash RGBA pour anti-boucle, PNG encode).
fn read_clipboard_image() -> Option<(String, Vec<u8>)> {
    let mut clip = arboard::Clipboard::new().ok()?;
    let img = clip.get_image().ok()?;
    let hash = hash_bytes(&img.bytes);
    let png = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.bytes.into_owned())?;
    let mut out = Vec::new();
    image::DynamicImage::ImageRgba8(png)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .ok()?;
    Some((hash, out))
}

fn current_change_count() -> isize {
    unsafe { NSPasteboard::generalPasteboard().changeCount() }
}

/// Lance le thread de surveillance. Idempotent a l'echelle de l'app (appele 1x au setup).
pub fn start_monitor(app: AppHandle) {
    thread::spawn(move || {
        // On part du changeCount actuel : on n'emet pas le contenu pre-existant au lancement.
        let mut last_count = current_change_count();
        // Anti-doublon : hash du dernier contenu emis. Recopier le meme texte/image
        // (changeCount incremente mais contenu identique) n'envoie qu'une fois.
        let mut last_emitted: Option<String> = None;

        loop {
            thread::sleep(Duration::from_millis(POLL_MS));

            let count = current_change_count();
            if count == last_count {
                continue;
            }
            last_count = count;

            if !store::is_configured() {
                continue;
            }

            let content = read_pasteboard();

            // Flag sensible -> ignore par defaut (ni chiffre, ni envoye, ni stocke).
            if content.is_concealed {
                continue;
            }

            // Texte : priorite.
            if let Some(text) = content.text {
                let hash = hash_text(&text);
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue; // meme contenu recopie -> pas de doublon
                }
                if let Err(e) = emit_clip(&app, &text) {
                    eprintln!("[clipd] emission texte echouee: {e}");
                } else {
                    last_emitted = Some(hash);
                }
                continue;
            }

            // Sinon : image.
            if let Some((hash, png)) = read_clipboard_image() {
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue;
                }
                if let Err(e) = emit_image(&app, &png) {
                    eprintln!("[clipd] emission image echouee: {e}");
                } else {
                    last_emitted = Some(hash);
                }
            }
        }
    });
}

/// Anti-boucle : true si on vient d'ecrire ce hash (a consommer, ne pas emettre).
fn consume_written(app: &AppHandle, hash: &str) -> bool {
    let state = app.state::<AppState>();
    let mut written = state.recently_written.lock().unwrap();
    written.remove(hash)
}

/// Chiffre puis POST /clip vers le serveur.
fn emit_clip(app: &AppHandle, text: &str) -> Result<(), String> {
    let cfg = store::load_config().ok_or("non configure")?;
    let token = store::get_device_token()?;

    let key = {
        let state = app.state::<AppState>();
        let guard = state.key.lock().unwrap();
        *guard.as_ref().ok_or("cle non chargee")?
    };

    let (ciphertext, nonce) = crypto::encrypt(&key, text)?;

    let payload = serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "origin_device_id": cfg.device_id,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "is_sensitive": false,
        "created_at": chrono::Utc::now().to_rfc3339(),
    });

    let url = format!("{}/api/clip", cfg.server_url);
    ureq::post(&url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip: {e}"))?;

    Ok(())
}

/// Chiffre l'image, l'upload comme blob, puis POST /clip kind=image.
fn emit_image(app: &AppHandle, png: &[u8]) -> Result<(), String> {
    let cfg = store::load_config().ok_or("non configure")?;
    let token = store::get_device_token()?;
    let key = {
        let state = app.state::<AppState>();
        let guard = state.key.lock().unwrap();
        *guard.as_ref().ok_or("cle non chargee")?
    };

    // 1. Upload du blob chiffre.
    let (blob_data, blob_nonce) = crypto::encrypt_bytes(&key, png)?;
    let blob_id = post_blob(&cfg.server_url, &token, &blob_data, &blob_nonce)?;

    // 2. Clip pointeur (ciphertext = petite legende chiffree, non vide).
    let (ciphertext, nonce) = crypto::encrypt(&key, "Image")?;
    let payload = serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "origin_device_id": cfg.device_id,
        "kind": "image",
        "blob_id": blob_id,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "is_sensitive": false,
        "created_at": chrono::Utc::now().to_rfc3339(),
    });
    ureq::post(&format!("{}/api/clip", cfg.server_url))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip image: {e}"))?;
    Ok(())
}

/// Upload d'un blob chiffre. Retourne son id.
fn post_blob(server_url: &str, token: &str, data: &str, nonce: &str) -> Result<String, String> {
    let resp: serde_json::Value = ureq::post(&format!("{server_url}/api/blob"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(serde_json::json!({ "data": data, "nonce": nonce }))
        .map_err(|e| format!("POST /blob: {e}"))?
        .into_json()
        .map_err(|e| format!("blob json: {e}"))?;
    resp["id"].as_str().map(String::from).ok_or("blob id manquant".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Securite critique : le marqueur ConcealedType (mot de passe) est detecte
    /// -> le contenu sera ignore (jamais chiffre ni envoye).
    #[test]
    fn detects_concealed_flag() {
        assert!(types_contain_concealed(&[
            "public.utf8-plain-text".into(),
            CONCEALED_TYPE.into(),
        ]));
    }

    /// Un texte normal n'est PAS marque sensible.
    #[test]
    fn normal_text_not_concealed() {
        assert!(!types_contain_concealed(&[
            "public.utf8-plain-text".into(),
            "public.html".into(),
        ]));
    }

    /// Roundtrip complet emission -> serveur -> fetch -> dechiffrement, avec vraie
    /// crypto. Gated : ne tourne que si CLIPD_TEST_TOKEN + CLIPD_TEST_DEVICE + URL sont
    /// definis ET un serveur tourne. Sinon skip.
    #[test]
    fn emit_then_fetch_decrypts() {
        let (Ok(token), Ok(device), Ok(url)) = (
            std::env::var("CLIPD_TEST_TOKEN"),
            std::env::var("CLIPD_TEST_DEVICE"),
            std::env::var("CLIPD_TEST_URL"),
        ) else {
            eprintln!("skip: env de test non defini");
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
            .expect("clip present dans l'historique");

        let decrypted = crypto::decrypt(
            &key,
            clip["ciphertext"].as_str().unwrap(),
            clip["nonce"].as_str().unwrap(),
        )
        .unwrap();

        assert_eq!(decrypted, secret, "le serveur relaie du ciphertext dechiffrable");
    }
}
