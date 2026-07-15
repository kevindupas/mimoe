import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tauri } from "../lib/tauri";
import type { FrontendConfig, View } from "../lib/types";

interface AppApi {
  ready: boolean;
  view: View;
  config: FrontendConfig | null;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  /** Mode pause : la copie locale ne part plus au serveur. */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  goTo: (view: View) => void;
  /** Appairage réussi : mémorise la config et bascule sur l'historique. */
  onPaired: (config: FrontendConfig) => void;
  unpair: () => Promise<void>;
}

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("history");
  const [config, setConfig] = useState<FrontendConfig | null>(null);
  const [soundOn, setSoundOnState] = useState(
    () => localStorage.getItem("clipd_sound") !== "off",
  );
  const [paused, setPausedState] = useState(
    () => localStorage.getItem("clipd_paused") === "on",
  );

  // Bootstrap : configuré → historique, sinon onboarding.
  useEffect(() => {
    (async () => {
      const configured = await tauri.isConfigured();
      if (configured) {
        setConfig(await tauri.getConfig());
        setView("history");
      } else {
        setView("onboarding");
      }
      setReady(true);
    })();
  }, []);

  // Resynchronise le mode pause vers Rust au démarrage (l'état vit côté JS).
  useEffect(() => {
    tauri.setPaused(paused).catch(() => {});
    // Volontairement au mount uniquement : les toggles passent par setPaused().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    localStorage.setItem("clipd_sound", on ? "on" : "off");
  }, []);

  const setPaused = useCallback((on: boolean) => {
    setPausedState(on);
    localStorage.setItem("clipd_paused", on ? "on" : "off");
    tauri.setPaused(on).catch((e) => console.error("set_paused", e));
  }, []);

  const goTo = useCallback((v: View) => setView(v), []);

  const onPaired = useCallback((cfg: FrontendConfig) => {
    setConfig(cfg);
    setView("history");
  }, []);

  const unpair = useCallback(async () => {
    await tauri.unpair();
    setConfig(null);
    setView("onboarding");
  }, []);

  const api = useMemo(
    () => ({ ready, view, config, soundOn, setSoundOn, paused, setPaused, goTo, onPaired, unpair }),
    [ready, view, config, soundOn, setSoundOn, paused, setPaused, goTo, onPaired, unpair],
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans <AppProvider>");
  return ctx;
}
