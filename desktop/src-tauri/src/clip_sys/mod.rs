//! Primitives presse-papier, une implementation par plateforme.
//!
//! `clipboard.rs` orchestre (boucle de surveillance, dedup, chiffrement, envoi) ;
//! ce module ne fournit que les 5 operations bas niveau qui different d'un OS a
//! l'autre. Ajouter Linux = ajouter un `linux.rs` exposant les memes fonctions.
//!
//! Interface commune attendue de chaque `os::*` :
//!   - `change_count() -> i64`            numero de sequence du presse-papier
//!   - `read() -> Content`               texte + flag sensible
//!   - `file_path() -> Option<String>`   chemin du fichier reference (copie explorateur)
//!   - `write_concealed(&str)`           ecrit du texte marque "sensible"
//!   - `set_file(&str)`                  place une reference de fichier (collage ailleurs)

/// Contenu texte lu du presse-papier + marqueur "sensible" (gestionnaire de mots
/// de passe). Un contenu sensible n'est jamais chiffre ni envoye.
pub struct Content {
    pub text: Option<String>,
    pub is_concealed: bool,
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;
