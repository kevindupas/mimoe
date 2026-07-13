//! Crypto E2E : derivation de cle Argon2id + AES-256-GCM.
//!
//! Modele "secret pre-partage" : tous les appareils tapent la MEME passphrase
//! et derivent la MEME cle grace a un sel FIXE partage. Le serveur ne voit
//! jamais ni la passphrase, ni la cle, ni le clair.
//!
//! IMPORTANT : ce sel doit etre IDENTIQUE sur tous les clients (Mac, Android).
//! Le changer casse la compatibilite entre appareils deja appaires.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};

/// Sel fixe partage entre tous les appareils. NE PAS modifier apres deploiement.
const SHARED_SALT: &[u8] = b"clipd::v1::shared-salt::do-not-change";

/// Derive une cle AES-256 (32 octets) a partir d'une passphrase via Argon2id.
pub fn derive_key(passphrase: &str) -> Result<[u8; 32], String> {
    // Params raisonnables pour un desktop : 64 MiB, 3 iterations, 1 lane.
    let params = Params::new(64 * 1024, 3, 1, Some(32))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), SHARED_SALT, &mut key)
        .map_err(|e| format!("argon2 derive: {e}"))?;
    Ok(key)
}

/// Dechiffre un clip. `ciphertext_b64` et `nonce_b64` viennent du serveur (base64).
pub fn decrypt(key: &[u8; 32], ciphertext_b64: &str, nonce_b64: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    let ct = B64
        .decode(ciphertext_b64)
        .map_err(|e| format!("base64 ciphertext: {e}"))?;
    let nonce_bytes = B64
        .decode(nonce_b64)
        .map_err(|e| format!("base64 nonce: {e}"))?;

    if nonce_bytes.len() != 12 {
        return Err("nonce doit faire 12 octets".into());
    }
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "dechiffrement echoue (mauvaise cle ou donnees alterees)".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("utf8: {e}"))
}

/// Chiffre un clip. Retourne `(ciphertext_b64, nonce_b64)`. Nonce aleatoire par message.
/// (Utilise a l'etape 3 : emission cote Mac.)
#[allow(dead_code)]
pub fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "chiffrement echoue".to_string())?;

    Ok((B64.encode(ct), B64.encode(nonce)))
}

/// Chiffre des octets bruts (image). Retourne `(ciphertext_b64, nonce_b64)`.
pub fn encrypt_bytes(key: &[u8; 32], plain: &[u8]) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plain)
        .map_err(|_| "chiffrement echoue".to_string())?;
    Ok((B64.encode(ct), B64.encode(nonce)))
}

/// Dechiffre des octets bruts (image).
pub fn decrypt_bytes(key: &[u8; 32], ciphertext_b64: &str, nonce_b64: &str) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let ct = B64.decode(ciphertext_b64).map_err(|e| format!("base64: {e}"))?;
    let nonce_bytes = B64.decode(nonce_b64).map_err(|e| format!("base64 nonce: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err("nonce doit faire 12 octets".into());
    }
    cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ct.as_ref())
        .map_err(|_| "dechiffrement echoue".to_string())
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
        // Garantit que deux appareils avec la meme passphrase se dechiffrent.
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

    /// Interop Android<->Mac : verifie que Rust derive la MEME cle et dechiffre
    /// un ciphertext produit par le code Java/BouncyCastle. Gated sur env.
    #[test]
    fn interop_with_java() {
        let (Ok(ct), Ok(nonce), Ok(pass), Ok(expect), Ok(keyhex)) = (
            std::env::var("JAVA_CT"),
            std::env::var("JAVA_NONCE"),
            std::env::var("JAVA_PASS"),
            std::env::var("JAVA_EXPECT"),
            std::env::var("JAVA_KEYHEX"),
        ) else {
            eprintln!("skip: env interop non defini");
            return;
        };

        let key = derive_key(&pass).unwrap();
        let rust_keyhex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(rust_keyhex, keyhex, "les cles derivees doivent etre identiques");

        let clear = decrypt(&key, &ct, &nonce).unwrap();
        assert_eq!(clear, expect, "Rust dechiffre le ciphertext Java");
    }
}
