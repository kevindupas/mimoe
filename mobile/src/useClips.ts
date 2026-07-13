import { useEffect, useRef, useState } from "react";
import { fetchBlob, fetchHistory, type RawClip } from "./api";
import { bytesToBase64, decrypt, decryptBytes } from "./crypto";
import { notifyClip } from "./notify";
import { connect } from "./realtime";
import { getKey, type Config } from "./store";

export interface Clip {
  id: string;
  kind: "text" | "image";
  text: string;
  imageB64?: string;
  origin: string;
  sensitive: boolean;
  createdAt: string;
  mine: boolean;
}

/** Charge l'historique + tient la connexion temps réel + notifie à la réception. */
export function useClips(cfg: Config) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const keyRef = useRef<Uint8Array | null>(null);

  async function toClip(r: RawClip, key: Uint8Array): Promise<Clip | null> {
    try {
      const text = decrypt(key, r.ciphertext, r.nonce);
      let imageB64: string | undefined;
      const isImage = r.kind === "image" && !!r.blob_id;
      if (isImage) {
        const blob = await fetchBlob(cfg.serverUrl, cfg.deviceToken, r.blob_id!);
        imageB64 = bytesToBase64(decryptBytes(key, blob.data, blob.nonce));
      }
      return {
        id: r.id, kind: isImage ? "image" : "text", text, imageB64,
        origin: r.origin_device_id, sensitive: r.is_sensitive,
        createdAt: r.created_at, mine: r.origin_device_id === cfg.deviceId,
      };
    } catch { return null; }
  }

  async function load() {
    const key = keyRef.current ?? (await getKey());
    keyRef.current = key;
    if (!key) return;
    const raws = await fetchHistory(cfg.serverUrl, cfg.deviceToken);
    const list: Clip[] = [];
    for (const r of raws) { const c = await toClip(r, key); if (c) list.push(c); }
    setClips(list);
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    const pusher = connect(cfg, async (raw: RawClip) => {
      const key = keyRef.current ?? (await getKey());
      keyRef.current = key;
      if (!key) return;
      const clip = await toClip(raw, key);
      if (!clip) return;
      setClips((cur) => (cur.some((c) => c.id === clip.id) ? cur : [clip, ...cur]));
      notifyClip(clip.kind, clip.text);
    });
    return () => pusher.disconnect();
  }, [cfg.serverUrl, cfg.deviceToken]);

  return { clips, refreshing, refresh };
}
