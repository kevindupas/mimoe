//! Windows clipboard via the Win32 API (`clipboard-win` crate).
//!
//! Equivalences with the macOS version:
//!   - `changeCount`            -> `GetClipboardSequenceNumber`
//!   - `ConcealedType` (read)   -> registered format "ExcludeClipboardContentFromMonitorProcessing"
//!   - `ConcealedType` (write)  -> we set that same format so the Windows history
//!                                 and password managers ignore it
//!   - file reference           -> CF_HDROP (list of dropped files)
//!
//! The Windows clipboard requires opening a global handle: `clipboard-win`
//! wraps the open/close and the retry attempts (the clipboard can be
//! momentarily locked by another app).

use clipboard_win::{
    empty, formats, get_clipboard, is_format_avail, raw, register_format, seq_num, Clipboard,
    Setter,
};

use super::Content;

/// Name of the Windows format that excludes content from the history and the
/// cloud clipboard. Password managers set it; we read it to ignore, and
/// write it to protect the seed.
const EXCLUDE_FORMAT: &str = "ExcludeClipboardContentFromMonitorProcessing";

/// Clipboard sequence number (changes on every copy).
/// 0 if unavailable: the loop will treat that as "no change".
/// `seq_num` does not require opening the clipboard.
pub fn change_count() -> i64 {
    seq_num().map(|n| n.get() as i64).unwrap_or(0)
}

/// Reads the clipboard: text + sensitive flag.
pub fn read() -> Content {
    // register_format + is_format_avail don't require opening the clipboard.
    let is_concealed = register_format(EXCLUDE_FORMAT)
        .map(|fmt| is_format_avail(fmt.get()))
        .unwrap_or(false);

    // get_clipboard opens and closes the clipboard itself.
    let text = get_clipboard(formats::Unicode)
        .ok()
        .filter(|t: &String| !t.is_empty());

    Content { text, is_concealed }
}

/// Path of the first file referenced by the clipboard (file explorer copy).
/// Windows Explorer drops a CF_HDROP list; we take the first element.
pub fn file_path() -> Option<String> {
    let files: Vec<String> = get_clipboard(formats::FileList).ok()?;
    files.into_iter().next().filter(|p| !p.is_empty())
}

/// Writes text while marking it "to ignore" for the clipboard history.
///
/// We keep the clipboard open once to set two formats on the same
/// content: the text, then the exclusion format (empty data, only its
/// presence matters). The `set_clipboard`/`get_clipboard` helpers would reopen the
/// clipboard on each call and the second would clear the first: so we go
/// through the `raw::*` functions that operate on the already-open handle.
pub fn write_concealed(text: &str) -> Result<(), String> {
    let _clip = Clipboard::new_attempts(10).map_err(|e| format!("clipboard open: {e}"))?;
    empty().map_err(|e| format!("clipboard clear: {e}"))?;

    raw::set_string(text).map_err(|e| format!("text write: {e}"))?;

    if let Some(fmt) = register_format(EXCLUDE_FORMAT) {
        // A single byte of data is enough: only the presence of the format is read.
        // set_without_clear: don't clear again (we keep the text set just before).
        let _ = raw::set_without_clear(fmt.get(), &[0u8]);
    }
    Ok(())
}

/// Places a FILE reference on the clipboard (pasting into the file explorer).
///
/// FileList writes a slice (`[String]`), unsized: the `set_clipboard`
/// helper (which takes the data by value) doesn't accept it. So we open
/// the clipboard and call `write_clipboard` from the Setter trait, which
/// takes a reference.
pub fn set_file(path: &str) -> Result<(), String> {
    let _clip = Clipboard::new_attempts(10).map_err(|e| format!("clipboard open: {e}"))?;
    empty().map_err(|e| format!("clipboard clear: {e}"))?;
    formats::FileList
        .write_clipboard(&[path.to_string()])
        .map_err(|e| format!("CF_HDROP write: {e}"))
}
