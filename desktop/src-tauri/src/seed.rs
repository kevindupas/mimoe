//! Seed phrase BIP39 : generation, normalisation, validation.
//!
//! La seed remplace la passphrase choisie par l'utilisateur. Elle reste une
//! simple chaine passee a `crypto::derive_key` : le sel, Argon2 et l'interop
//! Rust <-> JS ne changent pas.
//!
//! Wordlist anglaise : sans accent, donc saisissable sur tout clavier quelle
//! que soit la locale.
//!
//! IMPORTANT : `normalize` doit produire exactement le meme resultat ici et
//! cote mobile (`mobile/src/seed.ts`), sinon les deux appareils derivent des
//! cles differentes et rien ne se dechiffre. Voir les vecteurs de test.

use bip39::{Language, Mnemonic};
use unicode_normalization::UnicodeNormalization;

const LANG: Language = Language::English;

/// Nombre de mots d'une seed Mimoe : 128 bits d'entropie + 4 bits de checksum.
pub const WORD_COUNT: usize = 12;

/// Genere une seed de 12 mots via le CSPRNG systeme.
pub fn generate() -> Result<Vec<String>, String> {
    let m = Mnemonic::generate_in(LANG, WORD_COUNT).map_err(|e| format!("generation seed: {e}"))?;
    Ok(m.words().map(str::to_string).collect())
}

/// Normalise une seed avant derivation.
///
/// L'ordre des etapes fait partie du contrat inter-plateformes : NFKD, puis
/// minuscules, puis trim, puis espaces multiples reduites a une seule.
/// `derive_key` hache les octets bruts, donc une majuscule ou une espace en
/// trop suffit a produire une cle differente et un echec silencieux.
pub fn normalize(input: &str) -> String {
    input
        .nfkd()
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Valide une seed saisie : appartenance a la wordlist et checksum BIP39.
///
/// Le checksum est la raison d'etre de BIP39 ici : sans lui, une faute de
/// frappe derive une cle differente, l'appairage "reussit" et l'utilisateur
/// voit un historique vide sans le moindre indice.
pub fn validate(input: &str) -> Result<(), String> {
    let norm = normalize(input);
    let count = norm.split(' ').filter(|w| !w.is_empty()).count();
    if count != WORD_COUNT {
        return Err(format!("La seed doit faire {WORD_COUNT} mots (recu : {count})."));
    }
    Mnemonic::parse_in(LANG, &norm).map(|_| ()).map_err(|e| match e {
        bip39::Error::UnknownWord(i) => {
            let word = norm.split(' ').nth(i).unwrap_or("?");
            format!("Mot {} inconnu : « {word} ».", i + 1)
        }
        bip39::Error::InvalidChecksum => {
            "Seed invalide : un mot est erroné ou mal placé.".to_string()
        }
        other => format!("Seed invalide : {other}"),
    })
}

/// Wordlist complete, pour l'autocompletion cote interface.
pub fn wordlist() -> Vec<String> {
    LANG.word_list().iter().map(|w| w.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive_key;

    /// Vecteur BIP39 officiel (entropie nulle), sert d'ancrage inter-plateformes.
    const VEC: &str =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    /// Contrat inter-plateformes : ces sorties sont verifiees identiques a celles
    /// de `normalizeSeed` (mobile/src/seed.ts). Toute divergence ferait deriver au
    /// telephone et au Mac des cles differentes, sans erreur visible.
    /// Si ce test change, la version mobile doit changer avec lui.
    #[test]
    fn normalize_respecte_le_contrat_interop() {
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
            assert_eq!(normalize(input), expected, "entree : {input:?}");
        }
    }

    #[test]
    fn generate_donne_douze_mots_de_la_wordlist() {
        let words = generate().unwrap();
        assert_eq!(words.len(), WORD_COUNT);
        let list = wordlist();
        for w in &words {
            assert!(list.contains(w), "« {w} » hors wordlist");
        }
    }

    #[test]
    fn generate_ne_se_repete_pas() {
        // Deux tirages identiques signaleraient un RNG casse ou constant.
        assert_ne!(generate().unwrap(), generate().unwrap());
    }

    #[test]
    fn generate_produit_une_seed_valide() {
        assert!(validate(&generate().unwrap().join(" ")).is_ok());
    }

    #[test]
    fn normalize_absorbe_casse_espaces_et_trim() {
        assert_eq!(normalize("  Table   RIVAGE\tsonner\n"), "table rivage sonner");
    }

    #[test]
    fn normalize_est_idempotent() {
        let once = normalize("  Table   RIVAGE ");
        assert_eq!(normalize(&once), once);
    }

    /// Le point critique : deux saisies "differentes" doivent donner la MEME cle.
    #[test]
    fn saisies_equivalentes_derivent_la_meme_cle() {
        let a = derive_key(&normalize("  ABANDON abandon   about ")).unwrap();
        let b = derive_key(&normalize("abandon abandon about")).unwrap();
        assert_eq!(a, b);
    }

    /// Sans normalisation, l'echec serait silencieux : on verrouille le comportement.
    #[test]
    fn sans_normalisation_les_cles_divergent() {
        let brut = derive_key("  ABANDON abandon   about ").unwrap();
        let norm = derive_key(&normalize("  ABANDON abandon   about ")).unwrap();
        assert_ne!(brut, norm);
    }

    #[test]
    fn validate_accepte_le_vecteur_officiel() {
        assert!(validate(VEC).is_ok());
    }

    #[test]
    fn validate_accepte_une_saisie_mal_formatee() {
        assert!(validate(&format!("  {}  ", VEC.to_uppercase())).is_ok());
    }

    #[test]
    fn validate_rejette_un_mot_hors_wordlist() {
        let bad = VEC.replacen("about", "zzzznotaword", 1);
        let err = validate(&bad).unwrap_err();
        assert!(err.contains("inconnu"), "message inattendu : {err}");
    }

    #[test]
    fn validate_rejette_un_checksum_casse() {
        // Mot valide, mais checksum faux : c'est exactement la faute de frappe
        // qu'on veut attraper a la saisie plutot qu'a la premiere synchro.
        let bad = VEC.replacen("about", "zoo", 1);
        let err = validate(&bad).unwrap_err();
        assert!(err.contains("erroné"), "message inattendu : {err}");
    }

    #[test]
    fn validate_rejette_un_mauvais_nombre_de_mots() {
        assert!(validate("abandon abandon").unwrap_err().contains("12 mots"));
    }

    #[test]
    fn wordlist_fait_2048_mots() {
        assert_eq!(wordlist().len(), 2048);
    }
}
