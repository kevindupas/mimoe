//! Introspection des apps Windows pour la blacklist.
//!
//! - Focus : `active-win-pos-rs` (fenetre au premier plan). On prend le chemin de
//!   l'exe comme cle d'identite — Windows n'a pas de "bundle id".
//! - Liste installee : PowerShell scanne les raccourcis du menu Demarrer, resout
//!   l'exe cible et extrait l'icone en PNG base64. Meme principe que `mdfind` sur
//!   macOS : Rust lance l'outil natif et lit sa sortie JSON.
//!
//! La cle est le chemin de l'exe en minuscules des deux cotes (focus + liste),
//! pour qu'une app cochee bloque bien ses copies.

use std::process::Command;
use std::sync::OnceLock;

use serde::Deserialize;

use super::{InstalledApp, RunningApp};

/// Normalise un chemin d'exe en cle stable : minuscules (Windows est insensible
/// a la casse), pour comparer focus et liste sans faux negatif.
fn exe_key(path: &str) -> String {
    path.to_lowercase()
}

/// Exe de la fenetre au premier plan (celle qui vient de copier, en pratique).
pub fn frontmost_bundle_id() -> Option<String> {
    let win = active_win_pos_rs::get_active_window().ok()?;
    let path = win.process_path.to_string_lossy();
    if path.is_empty() {
        // Fallback : nom du process si le chemin est vide.
        (!win.app_name.is_empty()).then(|| exe_key(&win.app_name))
    } else {
        Some(exe_key(&path))
    }
}

/// Apps "en cours" : non fournies sur Windows pour l'instant. Le selecteur de
/// blacklist s'appuie sur la liste installee (`list_installed_apps`), qui couvre
/// le besoin. Enumerer les process actifs viendra plus tard si utile.
pub fn list_regular_apps() -> Vec<RunningApp> {
    Vec::new()
}

static INSTALLED_CACHE: OnceLock<Vec<InstalledApp>> = OnceLock::new();

/// Apps installees (nom, exe, icone). Mis en cache : le scan PowerShell ne tourne
/// qu'une fois par session (lancer un process a chaque ouverture des reglages
/// serait lent).
pub fn list_installed_apps() -> Vec<InstalledApp> {
    INSTALLED_CACHE.get_or_init(scan_installed).clone()
}

/// Un element du JSON produit par le script PowerShell.
#[derive(Deserialize)]
struct PsApp {
    name: String,
    path: String,
    icon: String,
}

fn scan_installed() -> Vec<InstalledApp> {
    // Scanne les .lnk des deux menus Demarrer (machine + utilisateur), resout la
    // cible .exe et sort {name, path, icon(base64 PNG)} en JSON compresse.
    //
    // Merci a Mephery pour l'idee geniale (scan du menu Demarrer + icone extraite
    // en base64, plutot que le registre) : https://github.com/Mephery
    const SCRIPT: &str = r#"
        Add-Type -AssemblyName System.Drawing
        $Shell = New-Object -ComObject WScript.Shell
        $Paths = @(
            "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        )
        $Apps = Get-ChildItem -Path $Paths -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $Target = $Shell.CreateShortcut($_.FullName).TargetPath
                if ($Target -and (Test-Path $Target) -and $Target.EndsWith(".exe")) {
                    $Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Target)
                    $Stream = New-Object System.IO.MemoryStream
                    $Bitmap = $Icon.ToBitmap()
                    $Bitmap.Save($Stream, [System.Drawing.Imaging.ImageFormat]::Png)
                    $Base64 = [Convert]::ToBase64String($Stream.ToArray())
                    $Bitmap.Dispose(); $Icon.Dispose(); $Stream.Dispose()
                    [PSCustomObject]@{
                        name = $_.BaseName
                        path = $Target
                        icon = "data:image/png;base64,$Base64"
                    }
                }
            } catch {}
        }
        if ($Apps) { $Apps | ConvertTo-Json -Compress } else { "[]" }
    "#;

    // `powershell` = Windows PowerShell 5, toujours present (contrairement a `pwsh`).
    // -NoProfile : pas de profil utilisateur (plus rapide, deterministe).
    let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .output()
    else {
        return Vec::new();
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    // ConvertTo-Json rend un objet nu (pas un tableau) quand il n'y a qu'un element.
    let parsed: Vec<PsApp> = if trimmed.starts_with('[') {
        serde_json::from_str(trimmed).unwrap_or_default()
    } else {
        serde_json::from_str::<PsApp>(trimmed).map(|a| vec![a]).unwrap_or_default()
    };

    let mut apps: Vec<InstalledApp> = parsed
        .into_iter()
        .map(|a| InstalledApp {
            name: a.name,
            bundle_id: exe_key(&a.path),
            icon: Some(a.icon),
        })
        .collect();

    // Dedup par cle (un meme exe peut avoir plusieurs raccourcis).
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.bundle_id == b.bundle_id);
    apps
}
