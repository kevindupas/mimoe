//! Emission : surveille le presse-papier et emet les changements chiffres.
//!
//! Orchestration COMMUNE a toutes les plateformes. Les 5 operations bas niveau
//! qui different d'un OS a l'autre (numero de sequence, lecture texte + flag
//! sensible, chemin de fichier reference, ecriture sensible, reference de
//! fichier) vivent dans `clip_sys`, une impl par plateforme.
//!
//! Le flag "sensible" (gestionnaire de mots de passe) est detecte via
//! `clip_sys::read` et le contenu correspondant n'est jamais chiffre ni envoye.
//!
//! Anti-boucle : avant d'emettre, on verifie le set `recently_written`. Si le
//! hash du contenu y est, c'est NOUS qui venons de l'ecrire (recopie depuis
//! l'historique) -> on consomme l'entree et on n'emet rien.

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

/// Ecrit du texte marque "sensible" : les gestionnaires d'historique ne
/// l'archivent pas, et notre propre moniteur l'ignore. Sert a copier la seed
/// sans la semer dans un historique en clair. Delegue a la primitive plateforme.
pub fn write_concealed(text: &str) -> Result<(), String> {
    clip_sys::write_concealed(text)
}

/// Lit une image du presse-papier (données brutes, ex. capture directe).
/// Renvoie (hash, PNG encodé, mime, nom). Les données brutes sont du RGBA → PNG.
fn read_clipboard_image() -> Option<(String, Vec<u8>, &'static str, String)> {
    let mut clip = arboard::Clipboard::new().ok()?;
    let img = clip.get_image().ok()?;
    let hash = hash_bytes(&img.bytes);
    let png = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.bytes.into_owned())?;
    let mut out = Vec::new();
    image::DynamicImage::ImageRgba8(png)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .ok()?;
    // Pas de fichier source (données brutes) → nom généré avec la date.
    let name = format!("Capture {}.png", chrono::Local::now().format("%Y-%m-%d à %H.%M.%S"));
    Some((hash, out, "image/png", name))
}

/// Mime d'une extension (large). Défaut : application/octet-stream.
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

/// Taille max d'un fichier synchronise (au-dela : ignore).
const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Si le presse-papier reference un FICHIER (copie depuis l'explorateur), on lit
/// son contenu BRUT (aucun ré-encodage → format d'origine, GIF animé conservés) et
/// on renvoie (hash, bytes, mime, nom, kind). kind = "image" ou "file" selon le mime.
fn read_file() -> Option<(String, Vec<u8>, &'static str, String, &'static str)> {
    let path = clip_sys::file_path()?; // chemin reel resolu (avec extension)
    let p = std::path::Path::new(&path);

    let meta = std::fs::metadata(&path).ok()?;
    if !meta.is_file() {
        return None; // dossier copie -> ignore
    }
    if meta.len() > MAX_FILE_BYTES {
        eprintln!("[mimoe] fichier trop gros ({} Mo), ignore", meta.len() / 1024 / 1024);
        return None;
    }

    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "fichier".into());
    let mime = mime_for_ext(&ext);
    let kind = if is_image_mime(mime) { "image" } else { "file" };

    let bytes = std::fs::read(&path).ok()?;
    let hash = hash_bytes(&bytes);
    Some((hash, bytes, mime, name, kind))
}

/// Lance le thread de surveillance. Idempotent a l'echelle de l'app (appele 1x au setup).
pub fn start_monitor(app: AppHandle) {
    thread::spawn(move || {
        // On part du numero de sequence actuel : on n'emet pas le contenu pre-existant au lancement.
        let mut last_count = clip_sys::change_count();
        // Anti-doublon : hash du dernier contenu emis. Recopier le meme texte/image
        // (changeCount incremente mais contenu identique) n'envoie qu'une fois.
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

            // Mode pause : on ignore ce changement (last_count deja avance -> pas de
            // rattrapage a la reprise). La copie locale marche, rien ne part au serveur.
            if app.state::<AppState>().paused.load(Ordering::Relaxed) {
                continue;
            }

            // Blacklist : si l'app au premier plan (celle qui vient de copier) est
            // blacklistee, on ignore cette copie.
            if let Some(bid) = crate::apps::frontmost_bundle_id() {
                if app.state::<AppState>().blacklist.lock().unwrap().contains(&bid) {
                    continue;
                }
            }

            let content = clip_sys::read();

            // Flag sensible -> ignore par defaut (ni chiffre, ni envoye, ni stocke).
            if content.is_concealed {
                continue;
            }

            // Fichier image copie depuis le Finder : le presse-papier ne contient que
            // la reference + le nom + une icone generique. On lit le VRAI fichier et on
            // l'emet comme image (sinon le nom partait en texte / l'icone en image).
            // Copie d'un FICHIER (Finder) : image OU tout autre type (pdf, csv, mp3…).
            if let Some((hash, bytes, mime, name, kind)) = read_file() {
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue;
                }
                if let Err(e) = emit_blob(&app, &bytes, mime, &name, kind) {
                    eprintln!("[mimoe] emission fichier echouee: {e}");
                } else {
                    last_emitted = Some(hash);
                }
                continue;
            }

            // Image DONNEES BRUTES (capture directe). UNIQUEMENT si ce n'est PAS une
            // copie de fichier (deja gere ci-dessus) : sinon arboard renvoie l'ICONE.
            if clip_sys::file_path().is_none() {
                if let Some((hash, png, mime, name)) = read_clipboard_image() {
                    if consume_written(&app, &hash) {
                        continue;
                    }
                    if last_emitted.as_deref() == Some(hash.as_str()) {
                        continue;
                    }
                    if let Err(e) = emit_blob(&app, &png, mime, &name, "image") {
                        eprintln!("[mimoe] emission image echouee: {e}");
                    } else {
                        last_emitted = Some(hash);
                    }
                    continue;
                }
            }

            // Sinon : texte.
            if let Some(text) = content.text {
                let hash = hash_text(&text);
                if consume_written(&app, &hash) {
                    continue;
                }
                if last_emitted.as_deref() == Some(hash.as_str()) {
                    continue; // meme contenu recopie -> pas de doublon
                }
                if let Err(e) = emit_clip(&app, &text) {
                    eprintln!("[mimoe] emission texte echouee: {e}");
                } else {
                    last_emitted = Some(hash);
                }
            }
        }
    });
}

/// Place une reference de FICHIER dans le presse-papier (pour coller ailleurs).
/// Delegue a la primitive plateforme.
pub fn set_pasteboard_file(path: &str) -> Result<(), String> {
    clip_sys::set_file(path)
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

    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let payload = serde_json::json!({
        "id": id,
        "origin_device_id": cfg.device_id,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "dedup_hash": hash_text(text),
        "is_sensitive": false,
        "created_at": created_at,
    });

    let url = format!("{}/api/clip", cfg.server_url);
    ureq::post(&url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip: {e}"))?;

    // Affichage instantané sur CE Mac (l'origine ne recoit pas son propre clip par WS).
    let _ = app.emit(
        "clip-local",
        serde_json::json!({
            "id": id, "kind": "text", "text": text,
            "origin_device_id": cfg.device_id, "created_at": created_at,
        }),
    );

    Ok(())
}

/// Chiffre un contenu binaire (image ou fichier, octets bruts), l'upload comme blob,
/// puis POST /clip avec kind + mime + nom (chiffre) pour restituer cote clients.
fn emit_blob(app: &AppHandle, bytes: &[u8], mime: &str, name: &str, kind: &str) -> Result<(), String> {
    let cfg = store::load_config().ok_or("non configure")?;
    let token = store::get_device_token()?;
    let key = {
        let state = app.state::<AppState>();
        let guard = state.key.lock().unwrap();
        *guard.as_ref().ok_or("cle non chargee")?
    };

    // 1. Compression (si utile) PUIS chiffrement du blob.
    let packed = crate::blobz::compress(bytes);
    let (blob_data, blob_nonce) = crypto::encrypt_bytes(&key, &packed)?;
    let blob_id = post_blob(&cfg.server_url, &token, &blob_data, &blob_nonce)?;

    // Cache disque local = octets BRUTS (décompressés) : pas de re-download au rendu.
    if let Ok(dir) = store::image_cache_dir() {
        let _ = std::fs::write(dir.join(&blob_id), bytes);
    }

    // 2. Clip pointeur (ciphertext = nom de fichier chiffre, affiche sous l'image).
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
        "dedup_hash": hash_bytes(bytes),
        "is_sensitive": false,
        "created_at": created_at,
    });
    ureq::post(&format!("{}/api/clip", cfg.server_url))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_json(payload)
        .map_err(|e| format!("POST /clip {kind}: {e}"))?;

    // Affichage instantané sur CE Mac.
    let _ = app.emit(
        "clip-local",
        serde_json::json!({
            "id": id, "kind": kind, "blob_id": blob_id, "mime": mime, "text": name,
            "origin_device_id": cfg.device_id, "created_at": created_at,
        }),
    );
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

    // La detection du marqueur "sensible" est desormais testee par plateforme
    // dans clip_sys (le format differe : ConcealedType macOS, format Win32 exclu).

    /// Roundtrip complet emission -> serveur -> fetch -> dechiffrement, avec vraie
    /// crypto. Gated : ne tourne que si MIMOE_TEST_TOKEN + MIMOE_TEST_DEVICE + URL sont
    /// definis ET un serveur tourne. Sinon skip.
    #[test]
    fn emit_then_fetch_decrypts() {
        let (Ok(token), Ok(device), Ok(url)) = (
            std::env::var("MIMOE_TEST_TOKEN"),
            std::env::var("MIMOE_TEST_DEVICE"),
            std::env::var("MIMOE_TEST_URL"),
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

