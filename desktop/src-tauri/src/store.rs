//! Persistance : config non-secrete sur disque (JSON), secrets dans le Keychain macOS.
//!
//! - Config (server_url, device_id, params Reverb) = JSON dans le dossier de config de l'app.
//!   Non sensible : l'app_key Reverb est publique dans le protocole pusher de toute facon.
//! - Secrets (device_token, cle de chiffrement derivee) = Keychain macOS, jamais sur disque.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYCHAIN_SERVICE: &str = "app.clipd";
const KC_DEVICE_TOKEN: &str = "device_token";
const KC_ENCRYPTION_KEY: &str = "encryption_key";

/// Config non-secrete, partagee avec le frontend (transport Reverb + appels HTTP).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub server_url: String,   // ex: http://host:8000
    pub device_id: String,    // uuid appareil (généré au 1er lancement)
    pub user_id: i64,         // compte (pour le canal privé clips.{user_id})
    pub reverb_app_key: String,
    pub reverb_host: String,
    pub reverb_port: u16,
    pub reverb_scheme: String, // http | https
    /// Bundle ids des apps dont les copies ne sont JAMAIS captees (blacklist locale).
    #[serde(default)]
    pub blacklist: Vec<String>,
}

fn config_path() -> Result<PathBuf, String> {
    let mut dir = dirs_config_dir()?;
    dir.push("app.clipd");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config: {e}"))?;
    dir.push("config.json");
    Ok(dir)
}

/// ~/Library/Application Support sur macOS.
fn dirs_config_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME introuvable".to_string())?;
    Ok(PathBuf::from(home).join("Library/Application Support"))
}

/// Dossier de cache des images déchiffrées (une image = un fichier local, déchiffré
/// une seule fois puis servi via file://). Doit matcher le scope assetProtocol.
pub fn image_cache_dir() -> Result<PathBuf, String> {
    let dir = dirs_config_dir()?.join("app.clipd").join("clipimg");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir clipimg: {e}"))?;
    Ok(dir)
}

pub fn load_config() -> Option<Config> {
    let path = config_path().ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_config(cfg: &Config) -> Result<(), String> {
    let path = config_path()?;
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize config: {e}"))?;
    std::fs::write(path, raw).map_err(|e| format!("write config: {e}"))
}

pub fn is_configured() -> bool {
    load_config()
        .map(|c| !c.server_url.is_empty() && !c.device_id.is_empty())
        .unwrap_or(false)
}

// --- Keychain ---

fn entry(user: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, user).map_err(|e| format!("keychain entry: {e}"))
}

pub fn save_device_token(token: &str) -> Result<(), String> {
    entry(KC_DEVICE_TOKEN)?
        .set_password(token)
        .map_err(|e| format!("keychain set token: {e}"))
}

pub fn get_device_token() -> Result<String, String> {
    entry(KC_DEVICE_TOKEN)?
        .get_password()
        .map_err(|e| format!("keychain get token: {e}"))
}

pub fn save_encryption_key(key: &[u8; 32]) -> Result<(), String> {
    entry(KC_ENCRYPTION_KEY)?
        .set_password(&B64.encode(key))
        .map_err(|e| format!("keychain set key: {e}"))
}

pub fn get_encryption_key() -> Result<[u8; 32], String> {
    let b64 = entry(KC_ENCRYPTION_KEY)?
        .get_password()
        .map_err(|e| format!("keychain get key: {e}"))?;
    let bytes = B64.decode(b64).map_err(|e| format!("decode key: {e}"))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "cle keychain de taille invalide".to_string())?;
    Ok(arr)
}

/// Desappaire : supprime config disque + secrets Keychain.
pub fn clear() -> Result<(), String> {
    if let Ok(path) = config_path() {
        let _ = std::fs::remove_file(path);
    }
    let _ = entry(KC_DEVICE_TOKEN).and_then(|e| e.delete_credential().map_err(|x| x.to_string()));
    let _ = entry(KC_ENCRYPTION_KEY).and_then(|e| e.delete_credential().map_err(|x| x.to_string()));
    Ok(())
}
