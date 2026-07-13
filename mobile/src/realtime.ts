// Connexion WebSocket temps réel (Reverb = protocole Pusher).
import Pusher from "pusher-js";
import type { Config } from "./store";
import { reverbHost, reverbTls } from "./store";
import type { RawClip } from "./api";

export function connect(cfg: Config, onClip: (raw: RawClip) => void): Pusher {
  const host = reverbHost(cfg.serverUrl);
  const tls = reverbTls(cfg.serverUrl);
  const pusher = new Pusher(cfg.reverbAppKey, {
    wsHost: host,
    wsPort: cfg.reverbPort,
    wssPort: cfg.reverbPort,
    forceTLS: tls,
    enabledTransports: ["ws", "wss"],
    cluster: "mt1",
    authEndpoint: `${cfg.serverUrl}/broadcasting/auth`,
    auth: { headers: { Authorization: `Bearer ${cfg.deviceToken}`, Accept: "application/json" } },
  });

  const ch = pusher.subscribe(`private-clips.${cfg.userId}`);
  ch.bind("clip.received", (raw: RawClip) => {
    if (raw.origin_device_id === cfg.deviceId) return; // anti-echo
    onClip(raw);
  });
  return pusher;
}
