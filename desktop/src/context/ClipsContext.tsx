import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { deleteClip, fetchClips, pinClip } from "../lib/api";
import { decryptRaw } from "../lib/clips";
import { pop } from "../lib/sound";
import { tauri } from "../lib/tauri";
import type { Clip, FrontendConfig, RawClip, WsStatus } from "../lib/types";
import { useApp } from "./AppContext";

interface ClipsApi {
  clips: Clip[];
  wsStatus: WsStatus;
  hidden: Set<string>;
  isHidden: (id: string) => boolean;
  toggleHide: (id: string) => void;
  copyClip: (clip: Clip) => Promise<void>;
  removeClip: (id: string) => void;
  undoDelete: (id: string) => void;
  pendingDeletes: Clip[];
  togglePin: (id: string) => Promise<void>;
}

const ClipsContext = createContext<ClipsApi | null>(null);

function loadHiddenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("mimoe_hidden") || "[]"));
  } catch {
    return new Set();
  }
}

export function ClipsProvider({
  config,
  children,
}: {
  config: FrontendConfig;
  children: ReactNode;
}) {
  const { soundOn } = useApp();

  const [clips, setClips] = useState<Clip[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [hidden, setHidden] = useState<Set<string>>(loadHiddenSet);
  const [pendingDeletes, setPendingDeletes] = useState<Clip[]>([]);
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Refs so the listeners (subscribed only once) read the fresh state.
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const loadHistory = useCallback(async () => {
    try {
      const raws = await fetchClips(config);
      const next: Clip[] = [];
      for (const raw of raws) {
        const c = await decryptRaw(raw, config);
        if (c) next.push(c);
      }
      setClips(next);
      // Prune the disk cache of images that are no longer in the history.
      tauri
        .pruneImageCache(next.filter((c) => c.blobId).map((c) => c.blobId!))
        .catch(() => {});
    } catch (e) {
      console.error("loadHistory", e);
    }
  }, [config]);

  // Load the history + wire up the real-time events (pushed by the Rust thread).
  useEffect(() => {
    loadHistory();

    const unlisteners: Array<Promise<() => void>> = [
      listen<string>("ws-status", (e) => {
        const s = e.payload;
        setWsStatus(s === "connected" ? "connected" : s === "error" ? "error" : "connecting");
      }),
      listen<RawClip>("clip-received", async (e) => {
        const raw = e.payload;
        // Already known clip (existing id): the server bumped it back up (a re-copy
        // of the same content). We move it to the top with a refreshed timestamp
        // rather than ignoring it. Also applies to our own rebroadcast clips.
        if (clipsRef.current.some((x) => x.id === raw.id)) {
          setClips((prev) => {
            const found = prev.find((x) => x.id === raw.id);
            if (!found) return prev;
            const rest = prev.filter((x) => x.id !== raw.id);
            return [{ ...found, created_at: raw.created_at }, ...rest];
          });
          return;
        }
        // New clip from another device. A new clip from THIS Mac arrives via
        // clip-local (instant display), not via WS → we ignore it here.
        if (raw.origin_device_id === config.device_id) return;
        const clip = await decryptRaw(raw, config);
        if (!clip) return;
        setClips((prev) =>
          prev.some((x) => x.id === clip.id) ? prev : [clip, ...prev],
        );
        if (soundRef.current) pop();
      }),
      listen<string[]>("clips-deleted", (e) => {
        const ids = new Set(e.payload ?? []);
        if (!ids.size) return;
        setClips((prev) => prev.filter((c) => !ids.has(c.id)));
      }),
      // Clip copied on THIS Mac: instant display (the origin does not receive its
      // own clip via WS → otherwise it would only appear on resync at focus).
      listen<{
        id: string;
        kind: string;
        text?: string;
        blob_id?: string;
        mime?: string;
        origin_device_id: string;
        created_at: string;
      }>("clip-local", (e) => {
        const p = e.payload;
        setClips((prev) => {
          if (prev.some((x) => x.id === p.id)) return prev;
          const clip: Clip = {
            id: p.id,
            origin_device_id: p.origin_device_id,
            kind: p.kind === "image" ? "image" : p.kind === "file" ? "file" : "text",
            text: p.text ?? "",
            blobId: p.blob_id ?? undefined,
            mime: p.mime ?? "image/png",
            pinned: false,
            is_sensitive: false,
            created_at: p.created_at,
            mine: true,
          };
          return [clip, ...prev];
        });
      }),
    ];

    // Window reopened (hotkey/tray): the Rust WS never dropped, we resync as a safeguard.
    const focusUnlisten = getCurrentWindow().listen("tauri://focus", () => {
      loadHistory();
    });

    return () => {
      unlisteners.forEach((p) => p.then((off) => off()));
      focusUnlisten.then((off) => off());
    };
  }, [config, loadHistory]);

  const isHidden = useCallback((id: string) => hidden.has(id), [hidden]);

  const toggleHide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("mimoe_hidden", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const copyClip = useCallback(
    async (clip: Clip) => {
      // We NEVER close the window on copy.
      if (clip.kind === "image" && clip.blobId) {
        await tauri.copyImage(clip.blobId);
      } else if (clip.kind === "file" && clip.blobId) {
        await tauri.copyFile(clip.blobId, clip.text);
      } else {
        await tauri.copyText(clip.text);
      }
    },
    [],
  );

  // DEFERRED deletion: we remove it from the list right away (+ Undo snackbar),
  // but the server DELETE is only sent after 4s. Undo before then = nothing is lost.
  const removeClip = useCallback(
    (id: string) => {
      const clip = clipsRef.current.find((c) => c.id === id);
      if (!clip) return;
      setClips((prev) => prev.filter((c) => c.id !== id));
      setPendingDeletes((prev) => [...prev.filter((c) => c.id !== id), clip]);

      const timer = setTimeout(async () => {
        deleteTimers.current.delete(id);
        setPendingDeletes((prev) => prev.filter((c) => c.id !== id));
        try {
          await deleteClip(config, id);
        } catch (e) {
          console.error("delete clip", e);
          loadHistory();
        }
      }, 4000);
      deleteTimers.current.set(id, timer);
    },
    [config, loadHistory],
  );

  const undoDelete = useCallback((id: string) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    setPendingDeletes((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (clip) {
        // Re-insert it in place (recency order = descending created_at).
        setClips((cs) =>
          [...cs, clip].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const togglePin = useCallback(
    async (id: string) => {
      const clip = clipsRef.current.find((c) => c.id === id);
      if (!clip) return;
      const next = !clip.pinned;
      setClips((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: next } : c)));
      try {
        await pinClip(config, id, next);
      } catch (e) {
        console.error("pin clip", e);
        loadHistory(); // resync if the call failed
      }
    },
    [config, loadHistory],
  );

  const api = useMemo(
    () => ({ clips, wsStatus, hidden, isHidden, toggleHide, copyClip, removeClip, undoDelete, pendingDeletes, togglePin }),
    [clips, wsStatus, hidden, isHidden, toggleHide, copyClip, removeClip, undoDelete, pendingDeletes, togglePin],
  );

  return <ClipsContext.Provider value={api}>{children}</ClipsContext.Provider>;
}

export function useClips(): ClipsApi {
  const ctx = useContext(ClipsContext);
  if (!ctx) throw new Error("useClips must be used within <ClipsProvider>");
  return ctx;
}
