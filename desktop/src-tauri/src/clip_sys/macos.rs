//! Presse-papier macOS via NSPasteboard natif.
//!
//! Deplace tel quel depuis l'ancien clipboard.rs : aucune logique modifiee.
//! NATIF (pas arboard) pour deux raisons :
//!   1. `changeCount` : detecte un changement sans comparer le contenu.
//!   2. `org.nspasteboard.ConcealedType` : marqueur "sensible" des gestionnaires
//!      de mots de passe, qu'on lit (pour ignorer) et qu'on ecrit (pour la seed).

use objc2_app_kit::NSPasteboard;
use objc2_foundation::{NSString, NSURL};

use super::Content;

const CONCEALED_TYPE: &str = "org.nspasteboard.ConcealedType";
// UTI du texte brut = valeur de NSPasteboardTypeString.
const TEXT_UTI: &str = "public.utf8-plain-text";
// UTI d'une reference de fichier (copie depuis le Finder).
const FILE_URL_UTI: &str = "public.file-url";

/// La liste des types du presse-papier contient-elle le marqueur sensible ?
fn types_contain_concealed(types: &[String]) -> bool {
    types.iter().any(|t| t == CONCEALED_TYPE)
}

/// Numero de sequence du presse-papier (change a chaque copie).
pub fn change_count() -> i64 {
    unsafe { NSPasteboard::generalPasteboard().changeCount() as i64 }
}

/// Lit le presse-papier : flag sensible + texte (None si pas de texte).
pub fn read() -> Content {
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

/// Vrai chemin du fichier reference par le presse-papier (copie Finder).
/// Le Finder donne une URL de reference (file:///.file/id=...) : NSURL.filePathURL
/// la resout en chemin reel avec extension (POSIX/realpath n'y arrive PAS).
pub fn file_path() -> Option<String> {
    // SAFETY : lecture du general pasteboard + resolution NSURL.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        let url_str = pb.stringForType(&NSString::from_str(FILE_URL_UTI))?;
        let url = NSURL::URLWithString(&url_str)?;
        let file_path_url = url.filePathURL()?;
        file_path_url.path().map(|p| p.to_string())
    }
}

/// Ecrit du texte en le marquant sensible (`org.nspasteboard.ConcealedType`).
///
/// Convention nspasteboard.org : les gestionnaires d'historique (Raycast, Maccy,
/// Alfred) n'archivent pas ce qui la porte, et notre propre moniteur l'ignore.
/// Sert a copier la seed sans la semer dans un historique en clair. Ne couvre pas
/// Universal Clipboard : ce n'est pas une API Apple.
pub fn write_concealed(text: &str) -> Result<(), String> {
    // SAFETY : ecriture du general pasteboard depuis le thread principal des commandes.
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();

        let ok = pb.setString_forType(&NSString::from_str(text), &NSString::from_str(TEXT_UTI));
        if !ok {
            return Err("ecriture presse-papier refusee".into());
        }
        // Le marqueur doit etre pose apres le texte : clearContents remet la liste a zero.
        pb.setString_forType(&NSString::from_str(""), &NSString::from_str(CONCEALED_TYPE));
        Ok(())
    }
}

/// Place une reference de FICHIER dans le presse-papier (pour coller dans Finder/apps).
pub fn set_file(path: &str) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_concealed_flag() {
        assert!(types_contain_concealed(&[
            "public.utf8-plain-text".into(),
            CONCEALED_TYPE.into(),
        ]));
    }

    #[test]
    fn normal_text_not_concealed() {
        assert!(!types_contain_concealed(&[
            "public.utf8-plain-text".into(),
            "public.html".into(),
        ]));
    }
}
