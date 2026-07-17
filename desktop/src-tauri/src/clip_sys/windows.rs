//! Presse-papier Windows via l'API Win32 (crate `clipboard-win`).
//!
//! Equivalences avec la version macOS :
//!   - `changeCount`            -> `GetClipboardSequenceNumber`
//!   - `ConcealedType` (lu)     -> format enregistre "ExcludeClipboardContentFromMonitorProcessing"
//!   - `ConcealedType` (ecrit)  -> on pose ce meme format pour que l'historique
//!                                 Windows et les gestionnaires de mots de passe l'ignorent
//!   - reference de fichier     -> CF_HDROP (liste de fichiers deposes)
//!
//! Le presse-papier Windows exige d'ouvrir un handle global : `clipboard-win`
//! encapsule l'ouverture/fermeture et les tentatives (le presse-papier peut etre
//! momentanement verrouille par une autre app).

use clipboard_win::{
    empty, formats, get_clipboard, is_format_avail, raw, register_format, seq_num, Clipboard,
    Setter,
};

use super::Content;

/// Nom du format Windows qui exclut un contenu de l'historique et du cloud
/// clipboard. Les gestionnaires de mots de passe le posent ; on le lit pour
/// ignorer, et on l'ecrit pour proteger la seed.
const EXCLUDE_FORMAT: &str = "ExcludeClipboardContentFromMonitorProcessing";

/// Numero de sequence du presse-papier (change a chaque copie).
/// 0 si indisponible : la boucle traitera ca comme "pas de changement".
/// `seq_num` ne requiert pas d'ouvrir le presse-papier.
pub fn change_count() -> i64 {
    seq_num().map(|n| n.get() as i64).unwrap_or(0)
}

/// Lit le presse-papier : texte + flag sensible.
pub fn read() -> Content {
    // register_format + is_format_avail ne requierent pas d'ouvrir le presse-papier.
    let is_concealed = register_format(EXCLUDE_FORMAT)
        .map(|fmt| is_format_avail(fmt.get()))
        .unwrap_or(false);

    // get_clipboard ouvre et ferme le presse-papier lui-meme.
    let text = get_clipboard(formats::Unicode)
        .ok()
        .filter(|t: &String| !t.is_empty());

    Content { text, is_concealed }
}

/// Chemin du premier fichier reference par le presse-papier (copie explorateur).
/// L'explorateur Windows depose une liste CF_HDROP ; on prend le premier element.
pub fn file_path() -> Option<String> {
    let files: Vec<String> = get_clipboard(formats::FileList).ok()?;
    files.into_iter().next().filter(|p| !p.is_empty())
}

/// Ecrit du texte en le marquant "a ignorer" par l'historique du presse-papier.
///
/// On garde le presse-papier ouvert une seule fois pour poser deux formats sur le
/// meme contenu : le texte, puis le format d'exclusion (donnee vide, seule sa
/// presence compte). Les helpers `set_clipboard`/`get_clipboard` rouvriraient le
/// presse-papier a chaque appel et le second viderait le premier : on passe donc
/// par les fonctions `raw::*` qui operent sur le handle deja ouvert.
pub fn write_concealed(text: &str) -> Result<(), String> {
    let _clip = Clipboard::new_attempts(10).map_err(|e| format!("ouverture presse-papier: {e}"))?;
    empty().map_err(|e| format!("vidage presse-papier: {e}"))?;

    raw::set_string(text).map_err(|e| format!("ecriture texte: {e}"))?;

    if let Some(fmt) = register_format(EXCLUDE_FORMAT) {
        // Une donnee d'un octet suffit : seule la presence du format est lue.
        // set_without_clear : ne pas re-vider (on garde le texte pose juste avant).
        let _ = raw::set_without_clear(fmt.get(), &[0u8]);
    }
    Ok(())
}

/// Place une reference de FICHIER dans le presse-papier (collage dans l'explorateur).
///
/// FileList ecrit un slice (`[String]`), non-dimensionne : le helper
/// `set_clipboard` (qui prend la donnee par valeur) ne l'accepte pas. On ouvre
/// donc le presse-papier et on appelle `write_clipboard` du trait Setter, qui
/// prend une reference.
pub fn set_file(path: &str) -> Result<(), String> {
    let _clip = Clipboard::new_attempts(10).map_err(|e| format!("ouverture presse-papier: {e}"))?;
    empty().map_err(|e| format!("vidage presse-papier: {e}"))?;
    formats::FileList
        .write_clipboard(&[path.to_string()])
        .map_err(|e| format!("ecriture CF_HDROP: {e}"))
}
