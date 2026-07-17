// i18n mobile — miroir de desktop/src/context/LanguageContext.tsx.
//
// Pas de bibliothèque : aucune chaîne n'a de pluriel ni d'interpolation, un
// runtime dédié n'apporterait rien.
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import pt from "./pt.json";

export type Lang = "fr" | "en" | "es" | "pt";
export type LangSetting = "system" | Lang;

/** `Record<Lang, typeof fr>` : une langue à qui il manque une clé ne compile pas. */
const translations: Record<Lang, typeof fr> = { fr, en, es, pt };

export type TKey = keyof typeof fr;

const KEY = "mimoe_lang";

/**
 * Langue courante hors React.
 *
 * Les notifications sont construites par un handler Expo, en dehors de l'arbre
 * de composants : aucun hook n'y est disponible. Le provider tient ce miroir à
 * jour pour que `translate` y réponde quand même.
 */
let activeLang: Lang = "en";

/** `t` utilisable hors composant. Dans un composant, préférer `useLanguage`. */
export function translate(key: TKey): string {
  return translations[activeLang][key] || translations.en[key] || key;
}

function detectSystemLanguage(): Lang {
  const code = (Localization.getLocales()[0]?.languageCode ?? "en").toLowerCase();
  return code === "fr" || code === "es" || code === "pt" ? code : "en";
}

interface LanguageContextValue {
  languageSetting: LangSetting;
  currentLanguage: Lang;
  setLanguageSetting: (l: LangSetting) => void;
  t: (key: TKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [languageSetting, setSetting] = useState<LangSetting>("system");
  const [systemLanguage] = useState<Lang>(detectSystemLanguage);

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => {
      if (v === "fr" || v === "en" || v === "es" || v === "pt" || v === "system") setSetting(v);
    });
  }, []);

  const setLanguageSetting = useCallback((l: LangSetting) => {
    setSetting(l);
    SecureStore.setItemAsync(KEY, l);
  }, []);

  const currentLanguage = languageSetting === "system" ? systemLanguage : languageSetting;
  activeLang = currentLanguage;

  const t = useCallback(
    (key: TKey) => translations[currentLanguage][key] || translations.en[key] || key,
    [currentLanguage],
  );

  const value = useMemo(
    () => ({ languageSetting, currentLanguage, setLanguageSetting, t }),
    [languageSetting, currentLanguage, setLanguageSetting, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage doit être utilisé dans un LanguageProvider");
  return ctx;
}
