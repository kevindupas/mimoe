// Connexion WebSocket temps réel (Reverb = protocole Pusher).
// Le build react-native de pusher-js exporte la classe en nommé (module.exports.Pusher),
// pas en default -> on prend l'un ou l'autre selon le bundle.
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
    // Detecte vite un socket mort (suspension OS en arriere-plan) -> reconnexion rapide
    // au lieu d'attendre le defaut ~120s. Ping toutes les 30s, pong sous 10s sinon reconnect.
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
