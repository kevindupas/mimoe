// Mimoe palette (teal) + theme selection — mirror of
// desktop/src/context/ThemeContext.tsx.
//
// The theme used to follow the OS with no way around it: "system" stays the
// default, but the manual choice is persisted like on desktop.
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export const colors = {
  light: {
    bg: "#F5F5F7",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F0F3",
    text: "#1D1D1F",
    textDim: "#6E6E73",
    textFaint: "#A1A1A6",
    accent: "#047A69",
    accentSoft: "rgba(4,122,105,0.10)",
    border: "#E4E4E7",
    danger: "#D70015",
  },
  dark: {
    bg: "#17181C",
    surface: "#202127",
    surfaceAlt: "#2A2B32",
    text: "#F2F2F5",
    textDim: "#A6A6B2",
    textFaint: "#79798A",
    accent: "#3FBFA8",
    accentSoft: "rgba(63,191,168,0.14)",
    border: "#33343D",
    danger: "#FF6B6B",
  },
};

export type Palette = typeof colors.light;
export type Scheme = "light" | "dark";
export type ThemeSetting = "system" | Scheme;

const KEY = "mimoe_theme";

interface ThemeContextValue {
  themeSetting: ThemeSetting;
  scheme: Scheme;
  palette: Palette;
  setThemeSetting: (t: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeSetting, setSetting] = useState<ThemeSetting>("system");

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setSetting(v);
    });
  }, []);

  const setThemeSetting = useCallback((t: ThemeSetting) => {
    setSetting(t);
    SecureStore.setItemAsync(KEY, t);
  }, []);

  const scheme: Scheme =
    themeSetting === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeSetting;

  const value = useMemo(
    () => ({ themeSetting, scheme, palette: colors[scheme], setThemeSetting }),
    [themeSetting, scheme, setThemeSetting],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
