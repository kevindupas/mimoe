//! NATIVE real-time WebSocket (Pusher/Reverb protocol).
//!
//! Why in Rust and not JS (pusher-js in the webview): macOS freezes the
//! WKWebView when the window is hidden (menu bar app) -> the JS WS connection dies
//! and never restarts. A native Rust thread is never frozen: the connection
//! stays alive in the background, reconnects on its own, and pushes received
//! clips to the frontend via a Tauri event.

use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};

use crate::store;

/// Prevents starting two real-time threads (setup at boot + after onboarding).
static STARTED: AtomicBool = AtomicBool::new(false);

/// Starts the real-time thread (idempotent). Idle until configured.
pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || run_loop(app));
}

/// Master loop: (re)connects forever with backoff. Never dies.
fn run_loop(app: AppHandle) {
    let mut backoff = 1u64;
    loop {
        // Not paired yet: just wait quietly.
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
            Ok(_) => backoff = 1, // clean close -> fast reconnect
            Err(e) => {
                eprintln!("[realtime] session err: {e}");
            }
        }
        let _ = app.emit("ws-status", "connecting");
        std::thread::sleep(Duration::from_secs(backoff));
        backoff = (backoff * 2).min(15); // 1,2,4,8,15,15...
    }
}

/// A full WS session: connection, private channel auth, read loop.
/// Returns Ok on a clean close, Err on any anomaly (-> reconnect).
fn session(app: &AppHandle, cfg: &store::Config, token: &str) -> Result<(), String> {
    let scheme = if cfg.reverb_scheme == "https" { "wss" } else { "ws" };
    let url = format!(
        "{scheme}://{}:{}/app/{}?protocol=7&client=rust-mimoe&version=1.0",
        cfg.reverb_host, cfg.reverb_port, cfg.reverb_app_key
    );

    let (mut sock, _resp) = connect(&url).map_err(|e| format!("connect: {e}"))?;

    // Anti-zombie backstop: if no data for 75s (Reverb pings ~60s), we
    // consider the connection dead and reconnect. A healthy connection gets a ping first.
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
                // Read timeout = silence too long = suspect connection -> reconnect.
                return Err("read timeout (dead connection)".into());
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
                    .ok_or("socket_id missing")?;

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
                // data = JSON-encoded string (payload of the Laravel broadcast).
                let data = v.get("data").and_then(|d| d.as_str()).unwrap_or("{}");
                if let Ok(raw) = serde_json::from_str::<serde_json::Value>(data) {
                    // Anti-echo: ignore our own clips.
                    let origin = raw.get("origin_device_id").and_then(|o| o.as_str()).unwrap_or("");
                    if origin == cfg.device_id {
                        continue;
                    }
                    // We push the raw clip: the frontend decrypts it (via the
                    // decrypt_clip command) and displays it, same as for the history.
                    let _ = app.emit("clip-received", raw);
                }
            }
            "clips.deleted" => {
                // Clips deleted server-side (cap/TTL): we forward the ids to the
                // frontend so it removes them from the list (no more stale entries shown).
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

/// Auth signature for the private channel, via /broadcasting/auth (like the JS clients).
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
        .ok_or("auth missing".into())
}

/// Sets the read timeout on the underlying TcpStream (plain or rustls TLS).
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
