//! Introspection des apps pour la blacklist, une implementation par plateforme.
//!
//! Deux besoins :
//!   - `frontmost_bundle_id()` : quelle app a le focus au moment de la copie, pour
//!     decider si on ignore (blacklist). Cle par-plateforme : bundle id sur macOS,
//!     chemin de l'exe sur Windows.
//!   - `list_installed_apps()` / `list_regular_apps()` : peupler le selecteur de
//!     blacklist. macOS via Spotlight (mdfind), Windows via PowerShell.
//!
//! La cle de blacklist DOIT etre coherente entre "quelle app a le focus" et "la
//! liste proposee", sinon cocher une app ne bloquerait jamais ses copies. Chaque
//! plateforme choisit sa cle et l'utilise des deux cotes.

use serde::Serialize;

#[derive(Serialize)]
pub struct RunningApp {
    pub name: String,
    /// Cle d'identite : bundle id (macOS) ou chemin de l'exe (Windows).
    pub bundle_id: String,
}

#[derive(Serialize, Clone)]
pub struct InstalledApp {
    pub name: String,
    /// Cle d'identite, alignee sur `frontmost_bundle_id` de la meme plateforme.
    pub bundle_id: String,
    /// Icône en data-URI PNG, ou None si extraction impossible.
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
