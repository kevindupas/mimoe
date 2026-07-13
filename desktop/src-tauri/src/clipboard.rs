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
    text: String,
    is_concealed: bool,
}

fn hash_text(text: &str) -> String {
    let mut h = Sha256::new();
    h.update(text.as_bytes());
    format!("{:x}", h.finalize())
}

/// Logique pure (testable) : la liste des types du presse-papier contient-elle
/// le marqueur sensible ?
fn types_contain_concealed(types: &[String]) -> bool {
    types.iter().any(|t| t == CONCEALED_TYPE)
}

/// Lit le presse-papier general. Renvoie None si pas de texte.
fn read_pasteboard() -> Option<Content> {
    // SAFETY : NSPasteboard general est accessible depuis n'importe quel thread
    // pour de la lecture. On ne conserve aucune reference au-dela de ce scope.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();

        // Detecte le flag sensible.
        let mut type_names = Vec::new();
        if let Some(types) = pb.types() {
            for i in 0..types.count() {
                type_names.push(types.objectAtIndex(i).to_string());
            }
        }
        let is_concealed = types_contain_concealed(&type_names);

        let text_type = NSString::from_str(TEXT_UTI);
        let s = pb.stringForType(&text_type)?;
        let text = s.to_string();
        if text.is_empty() {
            return None;
        }
        Some(Content { text, is_concealed })
    }
}

fn current_change_count() -> isize {
    unsafe { NSPasteboard::generalPasteboard().changeCount() }
}

/// Lance le thread de surveillance. Idempotent a l'echelle de l'app (appele 1x au setup).
pub fn start_monitor(app: AppHandle) {
    thread::spawn(move || {
        // On part du changeCount actuel : on n'emet pas le contenu pre-existant au lancement.
        let mut last_count = current_change_count();

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

            let Some(content) = read_pasteboard() else {
                continue;
            };

            // Flag sensible -> ignore par defaut (ni chiffre, ni envoye, ni stocke).
            if content.is_concealed {
                continue;
            }

            let hash = hash_text(&content.text);

            // Anti-boucle : si on vient d'ecrire ce contenu, on le consomme et on n'emet pas.
            {
                let state = app.state::<AppState>();
                let mut written = state.recently_written.lock().unwrap();
                if written.remove(&hash) {
                    continue;
                }
            }

            if let Err(e) = emit_clip(&app, &content.text) {
                eprintln!("[clipd] emission echouee: {e}");
            }
        }
    });
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
