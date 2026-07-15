//! BIP39 seed phrase: generation, normalization, validation.
//!
//! The seed replaces the user-chosen passphrase. It stays a plain string passed
//! to `crypto::derive_key`: the salt, Argon2, and the Rust <-> JS interop don't
//! change.
//!
//! English wordlist: no accents, so it can be typed on any keyboard regardless
//! of the locale.
//!
//! IMPORTANT: `normalize` must produce exactly the same result here and on the
//! mobile side (`mobile/src/seed.ts`), otherwise the two devices derive
//! different keys and nothing decrypts. See the test vectors.

use bip39::{Language, Mnemonic};
use unicode_normalization::UnicodeNormalization;

const LANG: Language = Language::English;

/// Number of words in a Mimoe seed: 128 bits of entropy + 4 bits of checksum.
pub const WORD_COUNT: usize = 12;

/// Generates a 12-word seed via the system CSPRNG.
pub fn generate() -> Result<Vec<String>, String> {
    let m = Mnemonic::generate_in(LANG, WORD_COUNT).map_err(|e| format!("seed generation: {e}"))?;
    Ok(m.words().map(str::to_string).collect())
}

/// Normalizes a seed before derivation.
///
/// The order of the steps is part of the cross-platform contract: NFKD, then
/// lowercase, then trim, then multiple spaces collapsed into one.
/// `derive_key` hashes the raw bytes, so a single uppercase letter or an extra
/// space is enough to produce a different key and a silent failure.
pub fn normalize(input: &str) -> String {
    input
        .nfkd()
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Validates an entered seed: membership in the wordlist and BIP39 checksum.
///
/// The checksum is BIP39's whole point here: without it, a typo derives a
/// different key, pairing "succeeds", and the user sees an empty history with
/// no hint whatsoever.
pub fn validate(input: &str) -> Result<(), String> {
    let norm = normalize(input);
    let count = norm.split(' ').filter(|w| !w.is_empty()).count();
    if count != WORD_COUNT {
        return Err(format!("The seed must be {WORD_COUNT} words (got {count})."));
    }
    Mnemonic::parse_in(LANG, &norm).map(|_| ()).map_err(|e| match e {
        bip39::Error::UnknownWord(i) => {
            let word = norm.split(' ').nth(i).unwrap_or("?");
            format!("Word {} not in the list: \"{word}\".", i + 1)
        }
        bip39::Error::InvalidChecksum => {
            "Invalid seed: a word is wrong or misplaced.".to_string()
        }
        other => format!("Invalid seed: {other}"),
    })
}

/// Full wordlist, for autocompletion on the UI side.
pub fn wordlist() -> Vec<String> {
    LANG.word_list().iter().map(|w| w.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive_key;

    /// Official BIP39 vector (zero entropy), serves as a cross-platform anchor.
    const VEC: &str =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    /// Cross-platform contract: these outputs are verified identical to those of
    /// `normalizeSeed` (mobile/src/seed.ts). Any divergence would make the phone
    /// and the Mac derive different keys, with no visible error.
    /// If this test changes, the mobile version must change along with it.
    #[test]
    fn normalize_matches_interop_contract() {
        let cases = [
            ("abandon abandon about", "abandon abandon about"),
            ("  ABANDON abandon   about ", "abandon abandon about"),
            ("Table\tRIVAGE\nsonner", "table rivage sonner"),
            ("abandon  ABOUT", "abandon about"),
            (" abandon about ", "abandon about"),
            ("ZOO zoo   Zoo", "zoo zoo zoo"),
            ("abandon", "abandon"),
        ];
        for (input, expected) in cases {
            assert_eq!(normalize(input), expected, "input: {input:?}");
        }
    }

    #[test]
    fn generate_yields_twelve_wordlist_words() {
        let words = generate().unwrap();
        assert_eq!(words.len(), WORD_COUNT);
        let list = wordlist();
        for w in &words {
            assert!(list.contains(w), "\"{w}\" not in wordlist");
        }
    }

    #[test]
    fn generate_does_not_repeat() {
        // Two identical draws would signal a broken or constant RNG.
        assert_ne!(generate().unwrap(), generate().unwrap());
    }

    #[test]
    fn generate_produces_valid_seed() {
        assert!(validate(&generate().unwrap().join(" ")).is_ok());
    }

    #[test]
    fn normalize_absorbs_case_spaces_and_trim() {
        assert_eq!(normalize("  Table   RIVAGE\tsonner\n"), "table rivage sonner");
    }

    #[test]
    fn normalize_is_idempotent() {
        let once = normalize("  Table   RIVAGE ");
        assert_eq!(normalize(&once), once);
    }

    /// The critical point: two "different" inputs must yield the SAME key.
    #[test]
    fn equivalent_inputs_derive_same_key() {
        let a = derive_key(&normalize("  ABANDON abandon   about ")).unwrap();
        let b = derive_key(&normalize("abandon abandon about")).unwrap();
        assert_eq!(a, b);
    }

    /// Without normalization the failure would be silent: we lock the behavior in.
    #[test]
    fn without_normalization_keys_diverge() {
        let brut = derive_key("  ABANDON abandon   about ").unwrap();
        let norm = derive_key(&normalize("  ABANDON abandon   about ")).unwrap();
        assert_ne!(brut, norm);
    }

    #[test]
    fn validate_accepts_official_vector() {
        assert!(validate(VEC).is_ok());
    }

    #[test]
    fn validate_accepts_badly_formatted_input() {
        assert!(validate(&format!("  {}  ", VEC.to_uppercase())).is_ok());
    }

    #[test]
    fn validate_rejects_word_outside_wordlist() {
        let bad = VEC.replacen("about", "zzzznotaword", 1);
        let err = validate(&bad).unwrap_err();
        assert!(err.contains("not in the list"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_broken_checksum() {
        // Valid word, but wrong checksum: this is exactly the kind of typo we want
        // to catch at input time rather than at the first sync.
        let bad = VEC.replacen("about", "zoo", 1);
        let err = validate(&bad).unwrap_err();
        assert!(err.contains("wrong"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_wrong_word_count() {
        assert!(validate("abandon abandon").unwrap_err().contains("12 words"));
    }

    #[test]
    fn wordlist_has_2048_words() {
        assert_eq!(wordlist().len(), 2048);
    }
}
