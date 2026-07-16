import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeSetting = "system" | "light" | "dark";

interface ThemeApi {
  themeSetting: ThemeSetting;
  setThemeSetting: (t: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/** Applique le thème (system/light/dark) via l'attribut data-theme sur <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeSetting, setThemeState] = useState<ThemeSetting>(
    () => (localStorage.getItem("mimoe_theme") as ThemeSetting) || "system",
  );

  useEffect(() => {
    const root = document.documentElement;
    if (themeSetting === "system") delete root.dataset.theme;
    else root.dataset.theme = themeSetting;
  }, [themeSetting]);

  const setThemeSetting = useCallback((t: ThemeSetting) => {
    setThemeState(t);
    localStorage.setItem("mimoe_theme", t);
  }, []);

  const api = useMemo(() => ({ themeSetting, setThemeSetting }), [themeSetting, setThemeSetting]);
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé dans <ThemeProvider>");
  return ctx;
}
