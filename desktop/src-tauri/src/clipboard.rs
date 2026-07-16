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

use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

use objc2_app_kit::NSPasteboard;
use objc2_foundation::{NSString, NSURL};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{crypto, store, AppState};

const CONCEALED_TYPE: &str = "org.nspasteboard.ConcealedType";
// UTI du texte brut = valeur de NSPasteboardTypeString.
const TEXT_UTI: &str = "public.utf8-plain-text";
// UTI d'une reference de fichier (copie depuis le Finder).
const FILE_URL_UTI: &str = "public.file-url";
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

/// Ecrit du texte en le marquant sensible (`org.nspasteboard.ConcealedType`).
///
/// Convention nspasteboard.org : les gestionnaires d'historique (Raycast, Maccy,
/// Alfred) n'archivent pas ce qui la porte, et notre propre moniteur l'ignore
/// deja. Sert a copier la seed sans la semer dans un historique en clair.
///
/// Elle ne couvre pas Universal Clipboard : ce n'est pas une API Apple, et rien
/// ne garantit que Handoff la respecte.
pub fn write_concealed(text: &str) -> Result<(), String> {
    // SAFETY : NSPasteboard general est accessible pour ecrire depuis le thread principal
    // des commandes Tauri.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();

        let ok = pb.setString_forType(
            &NSString::from_str(text),
            &NSString::from_str(TEXT_UTI),
        );
        if !ok {
            return Err("ecriture presse-papier refusee".into());
        }
        // Le marqueur doit etre pose apres le texte : clearContents remet la liste a zero.
        pb.setString_forType(
            &NSString::from_str(""),
            &NSString::from_str(CONCEALED_TYPE),
        );
        Ok(())
    }
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

/// Vrai chemin du fichier reference par le presse-papier (copie Finder).
/// Le Finder donne une URL de reference (file:///.file/id=...) : NSURL.filePathURL
/// la resout en chemin reel avec extension (POSIX/realpath n'y arrive PAS).
fn pasteboard_file_path() -> Option<String> {
    // SAFETY : lecture du general pasteboard + resolution NSURL.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        let url_str = pb.stringForType(&NSString::from_str(FILE_URL_UTI))?;
        let url = NSURL::URLWithString(&url_str)?;
        let file_path_url = url.filePathURL()?;
        file_path_url.path().map(|p| p.to_string())
    }
}

/// Taille max d'un fichier synchronise (au-dela : ignore).
const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Si le presse-papier reference un FICHIER (copie depuis le Finder), on lit son
/// contenu BRUT (aucun ré-encodage → format d'origine, GIF animé conservés) et on
/// renvoie (hash, bytes, mime, nom, kind). kind = "image" ou "file" selon le mime.
fn read_file() -> Option<(String, Vec<u8>, &'static str, String, &'static str)> {
    let path = pasteboard_file_path()?; // chemin reel resolu (avec extension)
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

            let content = read_pasteboard();

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
            if pasteboard_file_path().is_none() {
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

/// Ecrit une reference de FICHIER dans le presse-papier (pour coller dans Finder/apps).
pub fn set_pasteboard_file(path: &str) -> Result<(), String> {
    // SAFETY : ecriture du general pasteboard.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let abs = url.absoluteString().ok_or("url absolue introuvable")?;
        if pb.setString_forType(&abs, &NSString::from_str(FILE_URL_UTI)) {
            Ok(())
        } else {
            Err("setString(file-url) a echoue".into())
        }
    }
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

