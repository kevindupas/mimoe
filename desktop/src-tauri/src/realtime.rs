//! WebSocket temps reel NATIF (protocole Pusher/Reverb).
//!
//! Pourquoi en Rust et pas en JS (pusher-js dans la webview) : macOS gele la
//! WKWebView quand la fenetre est masquee (app menu bar) -> la co WS JS meurt et
//! ne se relance pas. Un thread Rust natif, lui, n'est jamais gele : la connexion
//! reste vivante en arriere-plan, se reconnecte toute seule, et pousse les clips
//! recus au frontend via un event Tauri.

use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};

use crate::store;

/// Empeche de lancer deux threads temps reel (setup au boot + apres onboarding).
static STARTED: AtomicBool = AtomicBool::new(false);

/// Lance le thread temps reel (idempotent). Idle tant que non configure.
pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || run_loop(app));
}

/// Boucle maitresse : (re)connecte a l'infini avec backoff. Ne meurt jamais.
fn run_loop(app: AppHandle) {
    let mut backoff = 1u64;
    loop {
        // Pas encore appaire : on attend tranquillement.
        if !store::is_configured() {
            std::thread::sleep(Duration::from_secs(2));
            continue;
        }
        let cfg = match store::load_config() {
            Some(c) => c,
            None => {
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
        };
        let token = match store::get_device_token() {
            Ok(t) => t,
            Err(_) => {
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
        };

        let _ = app.emit("ws-status", "connecting");
        match session(&app, &cfg, &token) {
            Ok(_) => backoff = 1, // fermeture propre -> reconnexion rapide
            Err(e) => {
                eprintln!("[realtime] session err: {e}");
            }
        }
        let _ = app.emit("ws-status", "connecting");
        std::thread::sleep(Duration::from_secs(backoff));
        backoff = (backoff * 2).min(15); // 1,2,4,8,15,15...
    }
}

/// Une session WS complete : connexion, auth canal prive, boucle de lecture.
/// Retourne Ok au close propre, Err sur toute anomalie (-> reconnexion).
fn session(app: &AppHandle, cfg: &store::Config, token: &str) -> Result<(), String> {
    let scheme = if cfg.reverb_scheme == "https" { "wss" } else { "ws" };
    let url = format!(
        "{scheme}://{}:{}/app/{}?protocol=7&client=rust-mimoe&version=1.0",
        cfg.reverb_host, cfg.reverb_port, cfg.reverb_app_key
    );

    let (mut sock, _resp) = connect(&url).map_err(|e| format!("connect: {e}"))?;

    // Backstop anti-zombie : si aucune donnee pendant 75s (Reverb ping ~60s), on
    // considere la co morte et on reconnecte. Une co saine recoit un ping avant.
    set_read_timeout(&mut sock, Some(Duration::from_secs(75)));

    let channel = format!("private-clips.{}", cfg.user_id);

    loop {
        let msg = match sock.read() {
            Ok(m) => m,
            Err(tungstenite::Error::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                // Timeout de lecture = silence trop long = co suspecte -> reconnecte.
                return Err("read timeout (co morte)".into());
            }
            Err(e) => return Err(format!("read: {e}")),
        };

        let txt = match msg {
            Message::Text(t) => t,
            Message::Ping(p) => {
                let _ = sock.send(Message::Pong(p));
                continue;
            }
            Message::Close(_) => return Ok(()),
            _ => continue,
        };

        let v: serde_json::Value = match serde_json::from_str(&txt) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let event = v.get("event").and_then(|e| e.as_str()).unwrap_or("");

        match event {
            "pusher:connection_established" => {
                let data = v.get("data").and_then(|d| d.as_str()).unwrap_or("{}");
                let socket_id = serde_json::from_str::<serde_json::Value>(data)
                    .ok()
                    .and_then(|d| d.get("socket_id").and_then(|s| s.as_str()).map(String::from))
                    .ok_or("socket_id manquant")?;

                let auth = auth_channel(cfg, token, &socket_id, &channel)?;
                let sub = serde_json::json!({
                    "event": "pusher:subscribe",
                    "data": { "auth": auth, "channel": channel }
                });
                sock.send(Message::Text(sub.to_string()))
                    .map_err(|e| format!("send subscribe: {e}"))?;
            }
            "pusher_internal:subscription_succeeded" | "pusher:subscription_succeeded" => {
                let _ = app.emit("ws-status", "connected");
            }
            "pusher:ping" => {
                let pong = serde_json::json!({"event":"pusher:pong","data":"{}"});
                let _ = sock.send(Message::Text(pong.to_string()));
            }
            "pusher:error" => {
                return Err(format!("pusher error: {}", v.get("data").unwrap_or(&v)));
            }
            "clip.received" => {
                // data = string JSON encodee (payload du broadcast Laravel).
                let data = v.get("data").and_then(|d| d.as_str()).unwrap_or("{}");
                if let Ok(raw) = serde_json::from_str::<serde_json::Value>(data) {
                    // Anti-echo : ignore nos propres clips.
                    let origin = raw.get("origin_device_id").and_then(|o| o.as_str()).unwrap_or("");
                    if origin == cfg.device_id {
                        continue;
                    }
                    // On pousse le clip brut : le frontend le dechiffre (via la
                    // commande decrypt_clip) et l'affiche, comme pour l'historique.
                    let _ = app.emit("clip-received", raw);
                }
            }
            "clips.deleted" => {
                // Clips supprimes cote serveur (cap/TTL) : on transmet les ids au
                // frontend pour qu'il les retire de la liste (plus de perime affiche).
                let data = v.get("data").and_then(|d| d.as_str()).unwrap_or("{}");
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(ids) = payload.get("ids") {
                        let _ = app.emit("clips-deleted", ids.clone());
                    }
                }
            }
            _ => {}
        }
    }
}

/// Signature d'auth pour le canal prive, via /broadcasting/auth (comme les clients JS).
fn auth_channel(
    cfg: &store::Config,
    token: &str,
    socket_id: &str,
    channel: &str,
) -> Result<String, String> {
    let resp: serde_json::Value = ureq::post(&format!("{}/broadcasting/auth", cfg.server_url))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .send_form(&[("socket_id", socket_id), ("channel_name", channel)])
        .map_err(|e| format!("broadcasting/auth: {e}"))?
        .into_json()
        .map_err(|e| format!("auth json: {e}"))?;
    resp.get("auth")
        .and_then(|a| a.as_str())
        .map(String::from)
        .ok_or("auth manquant".into())
}

/// Regle le read timeout sur le TcpStream sous-jacent (plain ou TLS rustls).
fn set_read_timeout(sock: &mut WebSocket<MaybeTlsStream<TcpStream>>, d: Option<Duration>) {
    match sock.get_mut() {
        MaybeTlsStream::Plain(s) => {
            let _ = s.set_read_timeout(d);
        }
        MaybeTlsStream::Rustls(s) => {
            let _ = s.sock.set_read_timeout(d);
        }
        _ => {}
    }
}
