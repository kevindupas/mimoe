//! E2E crypto: Argon2id key derivation + AES-256-GCM.
//!
//! "Pre-shared secret" model: every device types the SAME passphrase and
//! derives the SAME key thanks to a FIXED shared salt. The server never sees
//! the passphrase, the key, or the plaintext.
//!
//! IMPORTANT: this salt must be IDENTICAL across all clients (Mac, Android).
//! Changing it breaks compatibility between already-paired devices.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;

/// Fixed salt shared across all devices. DO NOT change after deployment.
const SHARED_SALT: &[u8] = b"mimoe::v1::shared-salt::do-not-change";

/// Derivation label for the fingerprint sub-key. The version suffix lets us
/// change its format later without ambiguity.
const DEDUP_LABEL: &[u8] = b"mimoe/dedup/v1";

/// Dedup fingerprint: HMAC-SHA256 of the content, under a DEDICATED sub-key.
///
/// A bare SHA256 of the plaintext would let the server test candidates (dictionary
/// attack on a short code, a known URL...). With HMAC, the server can compare two
/// equal fingerprints without ever being able to recover the content: it doesn't
/// have the key.
///
/// Domain separation: we do NOT use the raw encryption key as the HMAC key (reusing
/// one key for two primitives is bad hygiene). We derive a dedicated sub-key
/// `k_mac = HMAC(key, label)`, then compute the fingerprint with it. The encryption
/// key itself stays unchanged (interop preserved).
/// All devices share the same key -> same sub-key -> same fingerprint.
pub fn dedup_fingerprint(key: &[u8; 32], data: &[u8]) -> String {
    let k_mac = {
        let mut m = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC key 32 bytes");
        m.update(DEDUP_LABEL);
        m.finalize().into_bytes()
    };
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&k_mac).expect("HMAC sub-key");
    mac.update(data);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Derives an AES-256 key (32 bytes) from a passphrase via Argon2id.
pub fn derive_key(passphrase: &str) -> Result<[u8; 32], String> {
    // Reasonable params for a desktop: 64 MiB, 3 iterations, 1 lane.
    let params = Params::new(64 * 1024, 3, 1, Some(32))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), SHARED_SALT, &mut key)
        .map_err(|e| format!("argon2 derive: {e}"))?;
    Ok(key)
}

/// Decrypts a clip. `ciphertext_b64` and `nonce_b64` come from the server (base64).
pub fn decrypt(key: &[u8; 32], ciphertext_b64: &str, nonce_b64: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    let ct = B64
        .decode(ciphertext_b64)
        .map_err(|e| format!("base64 ciphertext: {e}"))?;
    let nonce_bytes = B64
        .decode(nonce_b64)
        .map_err(|e| format!("base64 nonce: {e}"))?;

    if nonce_bytes.len() != 12 {
        return Err("nonce must be 12 bytes".into());
    }
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "decryption failed (wrong key or altered data)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("utf8: {e}"))
}

/// Encrypts a clip. Returns `(ciphertext_b64, nonce_b64)`. Random nonce per message.
/// (Used at step 3: sending from the Mac side.)
#[allow(dead_code)]
pub fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "encryption failed".to_string())?;

    Ok((B64.encode(ct), B64.encode(nonce)))
}

/// Encrypts raw bytes (image). Returns `(ciphertext_b64, nonce_b64)`.
pub fn encrypt_bytes(key: &[u8; 32], plain: &[u8]) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plain)
        .map_err(|_| "encryption failed".to_string())?;
    Ok((B64.encode(ct), B64.encode(nonce)))
}

/// Decrypts raw bytes (image).
pub fn decrypt_bytes(key: &[u8; 32], ciphertext_b64: &str, nonce_b64: &str) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let ct = B64.decode(ciphertext_b64).map_err(|e| format!("base64: {e}"))?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| format!("base64 nonce: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err("nonce must be 12 bytes".into());
    }
    cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_ref())
        .map_err(|_| "decryption failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = derive_key("ma-passphrase-forte").unwrap();
        let (ct, nonce) = encrypt(&key, "secret SSH creds").unwrap();
        let clear = decrypt(&key, &ct, &nonce).unwrap();
        assert_eq!(clear, "secret SSH creds");
    }

    #[test]
    fn same_passphrase_same_key() {
        // Guarantees that two devices with the same passphrase can decrypt each other.
        let k1 = derive_key("hunter2").unwrap();
        let k2 = derive_key("hunter2").unwrap();
        assert_eq!(k1, k2);
    }

    #[test]
    fn wrong_key_fails() {
        let key = derive_key("bonne").unwrap();
        let (ct, nonce) = encrypt(&key, "data").unwrap();
        let bad = derive_key("mauvaise").unwrap();
        assert!(decrypt(&bad, &ct, &nonce).is_err());
    }

    /// Android<->Mac interop: checks that Rust derives the SAME key and decrypts
    /// a ciphertext produced by the Java/BouncyCastle code. Gated on env.
    #[test]
    fn interop_with_java() {
        let (Ok(ct), Ok(nonce), Ok(pass), Ok(expect), Ok(keyhex)) = (
            std::env::var("JAVA_CT"),
            std::env::var("JAVA_NONCE"),
            std::env::var("JAVA_PASS"),
            std::env::var("JAVA_EXPECT"),
            std::env::var("JAVA_KEYHEX"),
        ) else {
            eprintln!("skip: interop env not set");
            return;
        };

        let key = derive_key(&pass).unwrap();
        let rust_keyhex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(rust_keyhex, keyhex, "derived keys must be identical");

        let clear = decrypt(&key, &ct, &nonce).unwrap();
        assert_eq!(clear, expect, "Rust decrypts the Java ciphertext");
    }
}

#[cfg(test)]
mod fp_interop {
    use super::dedup_fingerprint;

    /// Cross-platform contract: this fingerprint is verified identical to the one
    /// from `dedupFingerprint` (mobile/src/crypto.ts) for the same key and the same
    /// content. If it changes, cross-device dedup breaks silently — the mobile
    /// version must change along with it.
    #[test]
    fn fingerprint_matches_interop_contract() {
        let key = [7u8; 32];
        assert_eq!(
            dedup_fingerprint(&key, b"hello world"),
            "76fa5a3cd223fa934bba1f9269980b5e04ffaa8583006e8279b2c4715ea95388",
        );
    }
}
