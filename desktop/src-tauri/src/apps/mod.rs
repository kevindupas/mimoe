//! Introspection of apps for the blacklist, with one implementation per platform.
//!
//! Two needs:
//!   - `frontmost_bundle_id()`: which app has focus at the moment of the copy, to
//!     decide whether to ignore it (blacklist). Per-platform key: bundle id on macOS,
//!     exe path on Windows.
//!   - `list_installed_apps()` / `list_regular_apps()`: populate the blacklist
//!     picker. macOS via Spotlight (mdfind), Windows via PowerShell.
//!
//! The blacklist key MUST be consistent between "which app has focus" and "the
//! offered list", otherwise ticking an app would never block its copies. Each
//! platform chooses its key and uses it on both sides.

use serde::Serialize;

#[derive(Serialize)]
pub struct RunningApp {
    pub name: String,
    /// Identity key: bundle id (macOS) or exe path (Windows).
    pub bundle_id: String,
}

#[derive(Serialize, Clone)]
pub struct InstalledApp {
    pub name: String,
    /// Identity key, aligned with `frontmost_bundle_id` of the same platform.
    pub bundle_id: String,
    /// Icon as a PNG data-URI, or None if extraction failed.
    pub icon: Option<String>,
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{frontmost_bundle_id, list_installed_apps, list_regular_apps};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{frontmost_bundle_id, list_installed_apps, list_regular_apps};
