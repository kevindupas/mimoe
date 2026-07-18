// Realtime WebSocket connection (Reverb = Pusher protocol).
// The react-native build of pusher-js exports the class as a named export (module.exports.Pusher),
// not as default -> we take one or the other depending on the bundle.
import PusherDefault from "pusher-js";
import type { RawClip } from "./api";
import type { Config } from "./store";
import { reverbHost, reverbTls } from "./store";

const Pusher: any = (PusherDefault as any).Pusher ?? PusherDefault;

export function connect(
  cfg: Config,
  onClip: (raw: RawClip) => void,
  onDeleted?: (ids: string[]) => void,
): any {
  const host = reverbHost(cfg.serverUrl);
  const tls = reverbTls(cfg.serverUrl);
  const pusher = new Pusher(cfg.reverbAppKey, {
    wsHost: host,
    wsPort: cfg.reverbPort,
    wssPort: cfg.reverbPort,
    forceTLS: tls,
    enabledTransports: ["ws", "wss"],
    cluster: "mt1",
    // Detects a dead socket quickly (OS suspension in the background) -> fast reconnection
    // instead of waiting the ~120s default. Ping every 30s, pong within 10s otherwise reconnect.
    activityTimeout: 30000,
    pongTimeout: 10000,
    authEndpoint: `${cfg.serverUrl}/broadcasting/auth`,
    auth: { headers: { Authorization: `Bearer ${cfg.deviceToken}`, Accept: "application/json" } },
  });

  const ch = pusher.subscribe(`private-clips.${cfg.userId}`);
  ch.bind("clip.received", (raw: RawClip) => {
    if (raw.origin_device_id === cfg.deviceId) return; // anti-echo
    onClip(raw);
  });
  ch.bind("clips.deleted", (payload: { ids?: string[] }) => {
    if (onDeleted && payload?.ids?.length) onDeleted(payload.ids);
  });
  return pusher;
}
