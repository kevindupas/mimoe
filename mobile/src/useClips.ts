import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { deleteClip, fetchHistory, type RawClip } from "./api";
import { loadClipCache, saveClipCache } from "./clipCache";
import { decrypt } from "./crypto";
import { pruneImageCache } from "./imageCache";
import { notifyClip } from "./notify";
import { connect } from "./realtime";
import { getKey, type Config } from "./store";

export interface Clip {
  id: string;
  kind: "text" | "image";
  text: string;
  blobId?: string; // image : chargée à la demande (lazy) via imageCache, pas ici
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
  const rawsRef = useRef<RawClip[]>([]); // dernier jeu de clips chiffrés (pour le cache)

  // Déchiffrement SYNC (juste AES, pas de réseau) -> paint instant. Images en lazy.
  function toClip(r: RawClip, key: Uint8Array): Clip | null {
    try {
      const text = decrypt(key, r.ciphertext, r.nonce);
      const isImage = r.kind === "image" && !!r.blob_id;
      return {
        id: r.id,
        kind: isImage ? "image" : "text",
        text,
        blobId: isImage ? r.blob_id! : undefined,
        origin: r.origin_device_id,
        sensitive: r.is_sensitive,
        createdAt: r.created_at,
        mine: r.origin_device_id === cfg.deviceId,
      };
    } catch {
      return null;
    }
  }

  function renderFrom(raws: RawClip[], key: Uint8Array) {
    rawsRef.current = raws;
    setClips(raws.map((r) => toClip(r, key)).filter((c): c is Clip => c !== null));
  }

  async function load() {
    const key = keyRef.current ?? (await getKey());
    keyRef.current = key;
    if (!key) return;
    const raws = await fetchHistory(cfg.serverUrl, cfg.deviceToken);
    renderFrom(raws, key);
    saveClipCache(raws);
    pruneImageCache(raws.filter((r) => r.kind === "image").map((r) => r.id));
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Retire des clips de la liste + cache + purge leurs images. Utilisé par la
  // suppression manuelle (optimiste) ET par le broadcast serveur (cap/TTL/delete).
  function removeLocal(ids: string[]) {
    const gone = new Set(ids);
    setClips((cur) => cur.filter((c) => !gone.has(c.id)));
    const next = rawsRef.current.filter((r) => !gone.has(r.id));
    rawsRef.current = next;
    saveClipCache(next);
    pruneImageCache(next.filter((r) => r.kind === "image").map((r) => r.id));
  }

  // Suppression avec Undo : retire tout de suite en local, mais ne DELETE le serveur
  // qu'apres 4s. Renvoie une fonction d'annulation qui remet le clip et coupe le DELETE.
  function softDelete(id: string): () => void {
    const raw = rawsRef.current.find((r) => r.id === id);
    removeLocal([id]);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) deleteClip(cfg.serverUrl, cfg.deviceToken, id).catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      const key = keyRef.current;
      if (raw && key) {
        const next = [raw, ...rawsRef.current.filter((r) => r.id !== id)]
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        renderFrom(next, key);
        saveClipCache(next);
      }
    };
  }

  useEffect(() => {
    let alive = true;

    const onClip = async (raw: RawClip) => {
      const key = keyRef.current ?? (await getKey());
      keyRef.current = key;
      if (!key) return;
      const clip = toClip(raw, key);
      if (!clip) return;
      setClips((cur) => (cur.some((c) => c.id === clip.id) ? cur : [clip, ...cur]));
      // maj cache : prepend + dédup + cap
      const next = [raw, ...rawsRef.current.filter((r) => r.id !== raw.id)].slice(0, 50);
      rawsRef.current = next;
      saveClipCache(next);
      notifyClip(clip.kind, clip.text);
    };

    // Clips supprimés côté serveur (cap/TTL/suppression manuelle) : retire-les live.
    const onDeleted = (ids: string[]) => removeLocal(ids);

    // 1) Paint INSTANT depuis le cache (déchiffrement local rapide), avant tout réseau.
    (async () => {
      const key = keyRef.current ?? (await getKey());
      keyRef.current = key;
      if (key && alive) {
        const cached = await loadClipCache();
        if (cached.length && alive) renderFrom(cached, key);
      }
      if (alive) load(); // 2) puis refresh serveur en fond
    })();

    const pusherRef = { current: connect(cfg, onClip, onDeleted) as any };

    // Android/iOS suspendent le WS en arrière-plan. Au retour au premier plan :
    // reconnecte si mort + resync l'historique.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const st = pusherRef.current?.connection?.state;
      if (st !== "connected") {
        try { pusherRef.current?.disconnect(); } catch {}
        pusherRef.current = connect(cfg, onClip, onDeleted);
      }
      load();
    });

    return () => {
      alive = false;
      sub.remove();
      pusherRef.current?.disconnect();
    };
  }, [cfg.serverUrl, cfg.deviceToken]);

  return { clips, refreshing, refresh, remove: removeLocal, softDelete };
}
