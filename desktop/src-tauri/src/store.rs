//! Persistence: non-secret config on disk (JSON), secrets in the macOS Keychain.
//!
//! - Config (server_url, device_id, Reverb params) = JSON in the app's config folder.
//!   Not sensitive: the Reverb app_key is public in the Pusher protocol anyway.
//! - Secrets (device_token, derived encryption key) = macOS Keychain, never on disk.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYCHAIN_SERVICE: &str = "app.mimoe";
const KC_DEVICE_TOKEN: &str = "device_token";
const KC_ENCRYPTION_KEY: &str = "encryption_key";

/// Non-secret config, shared with the frontend (Reverb transport + HTTP calls).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub server_url: String,   // e.g. http://host:8000
    pub device_id: String,    // device uuid (generated on first launch)
    pub user_id: i64,         // account (for the private channel clips.{user_id})
    #[serde(default)]
    pub email: String,        // account email (shown in settings)
    pub reverb_app_key: String,
    pub reverb_host: String,
    pub reverb_port: u16,
    pub reverb_scheme: String, // http | https
    /// Bundle ids of apps whose copies are NEVER captured (local blacklist).
    #[serde(default)]
    pub blacklist: Vec<String>,
}

fn config_path() -> Result<PathBuf, String> {
    let mut dir = dirs_config_dir()?;
    dir.push("app.mimoe");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config: {e}"))?;
    dir.push("config.json");
    Ok(dir)
}

/// Application data folder, per OS. Aligned with Tauri's `$DATA` variable in the
/// assetProtocol scope (same root on both sides, otherwise decrypted images
/// wouldn't be servable):
///   - macOS   : ~/Library/Application Support
///   - Windows : %APPDATA% (Roaming)
///   - Linux   : $XDG_DATA_HOME or ~/.local/share
fn dirs_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME not found".to_string())?;
        Ok(PathBuf::from(home).join("Library/Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not found".to_string())?;
        Ok(PathBuf::from(appdata))
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(x) = std::env::var("XDG_DATA_HOME") {
            if !x.is_empty() {
                return Ok(PathBuf::from(x));
            }
        }
        let home = std::env::var("HOME").map_err(|_| "HOME not found".to_string())?;
        Ok(PathBuf::from(home).join(".local/share"))
    }
}

/// Cache folder for decrypted images (one image = one local file, decrypted
/// once then served via file://). Must match the assetProtocol scope.
pub fn image_cache_dir() -> Result<PathBuf, String> {
    let dir = dirs_config_dir()?.join("app.mimoe").join("clipimg");
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
        .map_err(|_| "keychain key of invalid size".to_string())?;
    Ok(arr)
}

/// Unpairs: removes disk config + Keychain secrets.
pub fn clear() -> Result<(), String> {
    if let Ok(path) = config_path() {
        let _ = std::fs::remove_file(path);
    }
    let _ = entry(KC_DEVICE_TOKEN).and_then(|e| e.delete_credential().map_err(|x| x.to_string()));
    let _ = entry(KC_ENCRYPTION_KEY).and_then(|e| e.delete_credential().map_err(|x| x.to_string()));
    Ok(())
}
