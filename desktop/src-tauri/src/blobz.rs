//! Compression optionnelle des blobs (gzip) AVANT chiffrement.
//!
//! - On ne compresse que si ça réduit vraiment (les jpg/png/mp3/zip déjà compressés
//!   restent bruts → pas d'overhead).
//! - Format auto-descriptif : préfixe magique `CLZ1` + gzip. Sans préfixe = brut.
//!   → rétro-compatible avec les blobs déjà en base (non préfixés).

use std::io::{Read, Write};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

const MAGIC: &[u8; 4] = b"CLZ1";

/// Compresse si le résultat est plus petit, sinon renvoie les octets bruts.
pub fn compress(bytes: &[u8]) -> Vec<u8> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::default());
    if enc.write_all(bytes).is_err() {
        return bytes.to_vec();
    }
    let gz = match enc.finish() {
        Ok(v) => v,
        Err(_) => return bytes.to_vec(),
    };
    if gz.len() + MAGIC.len() < bytes.len() {
        let mut out = Vec::with_capacity(MAGIC.len() + gz.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&gz);
        out
    } else {
        bytes.to_vec()
    }
}

/// Décompresse si le préfixe magique est présent, sinon renvoie tel quel.
pub fn decompress(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() >= 4 && &bytes[..4] == MAGIC {
        let mut dec = GzDecoder::new(&bytes[4..]);
        let mut out = Vec::new();
        if dec.read_to_end(&mut out).is_ok() {
            return out;
        }
    }
    bytes.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_compressible() {
        let data = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".repeat(50).into_bytes();
        let c = compress(&data);
        assert!(&c[..4] == MAGIC, "devrait être compressé");
        assert!(c.len() < data.len());
        assert_eq!(decompress(&c), data);
    }

    #[test]
    fn incompressible_stays_raw() {
        // Octets haute-entropie (LCG, octet de poids fort) → gzip ne réduit pas → brut.
        let mut s: u64 = 0x1234_5678_9abc_def0;
        let data: Vec<u8> = (0..4096)
            .map(|_| {
                s = s.wrapping_mul(6364136223846793005).wrapping_add(1);
                (s >> 56) as u8
            })
            .collect();
        let c = compress(&data);
        assert!(c.len() < 4 || &c[..4] != MAGIC, "ne devrait pas être compressé");
        assert_eq!(decompress(&c), data); // brut décompressé = identité
    }

    #[test]
    fn decompress_raw_is_identity() {
        let data = b"blob non compresse (ancien format)".to_vec();
        assert_eq!(decompress(&data), data);
    }
}
