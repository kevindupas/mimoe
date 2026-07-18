// Mobile i18n — mirror of desktop/src/context/LanguageContext.tsx.
//
// No library: no string has a plural or interpolation, a dedicated runtime
// would bring nothing.
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import pt from "./pt.json";

export type Lang = "fr" | "en" | "es" | "pt";
export type LangSetting = "system" | Lang;

/** `Record<Lang, typeof fr>`: a language missing a key does not compile. */
const translations: Record<Lang, typeof fr> = { fr, en, es, pt };

export type TKey = keyof typeof fr;

const KEY = "mimoe_lang";

/**
 * Current language outside React.
 *
 * Notifications are built by an Expo handler, outside the component tree:
 * no hook is available there. The provider keeps this mirror up to date so
 * that `translate` still answers.
 */
let activeLang: Lang = "en";

/** `t` usable outside a component. In a component, prefer `useLanguage`. */
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
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
