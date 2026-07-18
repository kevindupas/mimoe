import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { deleteClip, fetchHistory, pinClip, type RawClip } from "./api";
import { loadClipCache, saveClipCache } from "./clipCache";
import { decrypt } from "./crypto";
import { pruneImageCache } from "./imageCache";
import { notifyClip } from "./notify";
import { connect } from "./realtime";
import { getKey, type Config } from "./store";

export interface Clip {
  id: string;
  kind: "text" | "image" | "file";
  text: string;
  blobId?: string; // image/file: loaded on demand (lazy) via cache, not here
  mime?: string; // original format (image/gif, application/pdf…)
  pinned: boolean;
  origin: string;
  sensitive: boolean;
  createdAt: string;
  mine: boolean;
}

/** Loads the history + keeps the realtime connection + notifies on receipt. */
export function useClips(cfg: Config) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const keyRef = useRef<Uint8Array | null>(null);
  const rawsRef = useRef<RawClip[]>([]); // last set of encrypted clips (for the cache)

  // SYNC decryption (just AES, no network) -> instant paint. Images lazy.
  function toClip(r: RawClip, key: Uint8Array): Clip | null {
    try {
      const text = decrypt(key, r.ciphertext, r.nonce);
      const kind = r.kind === "image" ? "image" : r.kind === "file" ? "file" : "text";
      const hasBlob = (kind === "image" || kind === "file") && !!r.blob_id;
      return {
        id: r.id,
        kind,
        text,
        blobId: hasBlob ? r.blob_id! : undefined,
        mime: r.mime ?? undefined,
        pinned: r.pinned ?? false,
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
    const list = raws.map((r) => toClip(r, key)).filter((c): c is Clip => c !== null);
    // Pinned first, then recency.
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    setClips(list);
  }

  // Pin / unpin (optimistic + server PATCH, resync on failure).
  function togglePin(id: string) {
    const raw = rawsRef.current.find((r) => r.id === id);
    const key = keyRef.current;
    if (!raw || !key) return;
    const next = !raw.pinned;
    const updated = rawsRef.current.map((r) => (r.id === id ? { ...r, pinned: next } : r));
    renderFrom(updated, key);
    saveClipCache(updated);
    pinClip(cfg.serverUrl, cfg.deviceToken, id, next).catch(() => refresh());
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

  // Removes clips from the list + cache + purges their images. Used by manual
  // deletion (optimistic) AND by the server broadcast (cap/TTL/delete).
  function removeLocal(ids: string[]) {
    const gone = new Set(ids);
    setClips((cur) => cur.filter((c) => !gone.has(c.id)));
    const next = rawsRef.current.filter((r) => !gone.has(r.id));
    rawsRef.current = next;
    saveClipCache(next);
    pruneImageCache(next.filter((r) => r.kind === "image").map((r) => r.id));
  }

  // Deletion with Undo: removes it locally right away, but only DELETEs on the
  // server after 4s. Returns a cancel function that restores the clip and stops the DELETE.
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

      // Clip already known (rawsRef = current set): the server bumped it up
      // (recopy of the same content). We move it to the top with the refreshed
      // timestamp, without re-decrypting.
      const known = rawsRef.current.some((r) => r.id === raw.id);
      if (known) {
        setClips((cur) => {
          const found = cur.find((c) => c.id === raw.id);
          if (!found) return cur;
          return [{ ...found, createdAt: raw.created_at }, ...cur.filter((c) => c.id !== raw.id)];
        });
        const bumped = [raw, ...rawsRef.current.filter((r) => r.id !== raw.id)].slice(0, 50);
        rawsRef.current = bumped;
        saveClipCache(bumped);
        return;
      }

      const clip = toClip(raw, key);
      if (!clip) return;
      setClips((cur) => (cur.some((c) => c.id === clip.id) ? cur : [clip, ...cur]));
      // cache update: prepend + dedup + cap
      const next = [raw, ...rawsRef.current.filter((r) => r.id !== raw.id)].slice(0, 50);
      rawsRef.current = next;
      saveClipCache(next);
      notifyClip(clip.kind, clip.text);
    };

    // Clips deleted on the server side (cap/TTL/manual deletion): remove them live.
    const onDeleted = (ids: string[]) => removeLocal(ids);

    // 1) INSTANT paint from the cache (fast local decryption), before any network.
    (async () => {
      const key = keyRef.current ?? (await getKey());
      keyRef.current = key;
      if (key && alive) {
        const cached = await loadClipCache();
        if (cached.length && alive) renderFrom(cached, key);
      }
      if (alive) load(); // 2) then background server refresh
    })();

    const pusherRef = { current: connect(cfg, onClip, onDeleted) as any };

    // Android/iOS suspend the WS in the background. On return to the foreground:
    // reconnect if dead + resync the history.
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

  return { clips, refreshing, refresh, remove: removeLocal, softDelete, togglePin };
}
