//! Clipboard primitives, one implementation per platform.
//!
//! `clipboard.rs` orchestrates (monitoring loop, dedup, encryption, sending);
//! this module only provides the 5 low-level operations that differ from one OS
//! to another. Adding Linux = adding a `linux.rs` exposing the same functions.
//!
//! Common interface expected from each `os::*`:
//!   - `change_count() -> i64`            clipboard sequence number
//!   - `read() -> Content`               text + sensitive flag
//!   - `file_path() -> Option<String>`   path of the referenced file (file explorer copy)
//!   - `write_concealed(&str)`           writes text marked "sensitive"
//!   - `set_file(&str)`                  places a file reference (pasting elsewhere)

/// Text content read from the clipboard + "sensitive" marker (password
/// manager). Sensitive content is never encrypted nor sent.
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
