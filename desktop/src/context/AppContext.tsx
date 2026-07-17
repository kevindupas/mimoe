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
  /** Pause mode: the local copy no longer goes to the server. */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  goTo: (view: View) => void;
  /** Pairing succeeded: stores the config and switches to the history. */
  onPaired: (config: FrontendConfig) => void;
  unpair: () => Promise<void>;
}

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("history");
  const [config, setConfig] = useState<FrontendConfig | null>(null);
  const [soundOn, setSoundOnState] = useState(
    () => localStorage.getItem("mimoe_sound") !== "off",
  );
  const [paused, setPausedState] = useState(
    () => localStorage.getItem("mimoe_paused") === "on",
  );

  // Bootstrap: configured → history, otherwise onboarding.
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

  // Resync the pause mode to Rust on startup (the state lives on the JS side).
  useEffect(() => {
    tauri.setPaused(paused).catch(() => {});
    // Intentionally on mount only: toggles go through setPaused().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    localStorage.setItem("mimoe_sound", on ? "on" : "off");
  }, []);

  const setPaused = useCallback((on: boolean) => {
    setPausedState(on);
    localStorage.setItem("mimoe_paused", on ? "on" : "off");
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
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
