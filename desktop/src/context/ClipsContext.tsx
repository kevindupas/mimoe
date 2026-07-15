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
  removeClip: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

const ClipsContext = createContext<ClipsApi | null>(null);

function loadHiddenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("clipd_hidden") || "[]"));
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

  // Refs pour que les listeners (abonnés une seule fois) lisent l'état frais.
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
      // Nettoie le cache disque des images qui ne sont plus dans l'historique.
      tauri
        .pruneImageCache(next.filter((c) => c.blobId).map((c) => c.blobId!))
        .catch(() => {});
    } catch (e) {
      console.error("loadHistory", e);
    }
  }, [config]);

  // Charge l'historique + branche les events temps réel (poussés par le thread Rust).
  useEffect(() => {
    loadHistory();

    const unlisteners: Array<Promise<() => void>> = [
      listen<string>("ws-status", (e) => {
        const s = e.payload;
        setWsStatus(s === "connected" ? "connected" : s === "error" ? "error" : "connecting");
      }),
      listen<RawClip>("clip-received", async (e) => {
        const raw = e.payload;
        if (raw.origin_device_id === config.device_id) return;
        if (clipsRef.current.some((x) => x.id === raw.id)) return;
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
      // Clip copié sur CE Mac : affichage instantané (l'origine ne reçoit pas son
      // propre clip par WS → sinon il n'apparaissait qu'au resync sur focus).
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

    // Fenêtre rouverte (hotkey/tray) : le WS Rust n'a jamais coupé, on resync par sécurité.
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
      localStorage.setItem("clipd_hidden", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const copyClip = useCallback(
    async (clip: Clip) => {
      // On ne ferme JAMAIS la fenêtre sur copie.
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

  const removeClip = useCallback(
    async (id: string) => {
      setClips((prev) => prev.filter((c) => c.id !== id)); // optimiste
      try {
        await deleteClip(config, id);
      } catch (e) {
        console.error("delete clip", e);
        loadHistory(); // resync si l'appel a échoué
      }
    },
    [config, loadHistory],
  );

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
        loadHistory(); // resync si l'appel a échoué
      }
    },
    [config, loadHistory],
  );

  const api = useMemo(
    () => ({ clips, wsStatus, hidden, isHidden, toggleHide, copyClip, removeClip, togglePin }),
    [clips, wsStatus, hidden, isHidden, toggleHide, copyClip, removeClip, togglePin],
  );

  return <ClipsContext.Provider value={api}>{children}</ClipsContext.Provider>;
}

export function useClips(): ClipsApi {
  const ctx = useContext(ClipsContext);
  if (!ctx) throw new Error("useClips doit être utilisé dans <ClipsProvider>");
  return ctx;
}
