import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "../i18n/en.json";
import es from "../i18n/es.json";
import fr from "../i18n/fr.json";
import pt from "../i18n/pt.json";

export type Lang = "fr" | "en" | "es" | "pt";
export type LangSetting = "system" | "fr" | "en" | "es" | "pt";

/** `Record<Lang, typeof fr>` : une langue à qui il manque une clé ne compile pas. */
const translations: Record<Lang, typeof fr> = { fr, en, es, pt };

interface LanguageContextProps {
  languageSetting: LangSetting;
  currentLanguage: Lang;
  setLanguageSetting: (lang: LangSetting) => void;
  t: (key: keyof typeof translations.fr) => string;
}

const LanguageContext = createContext<LanguageContextProps | null>(null);

function detectSystemLanguage(): Lang {
  const sysLang = navigator.language || (navigator.languages && navigator.languages[0]) || "en";
  const code = sysLang.toLowerCase().substring(0, 2);
  if (code === "fr") return "fr";
  if (code === "es") return "es";
  if (code === "pt") return "pt";
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [languageSetting, setLanguageSettingState] = useState<LangSetting>(() => {
    return (localStorage.getItem("mimoe_lang") as LangSetting) || "system";
  });

  const [detectedLanguage, setDetectedLanguage] = useState<Lang>(detectSystemLanguage);

  // Listen to language changes
  useEffect(() => {
    const handleLangChange = () => {
      setDetectedLanguage(detectSystemLanguage());
    };
    window.addEventListener("languagechange", handleLangChange);
    return () => window.removeEventListener("languagechange", handleLangChange);
  }, []);

  const currentLanguage = useMemo<Lang>(() => {
    if (languageSetting === "system") {
      return detectedLanguage;
    }
    return languageSetting;
  }, [languageSetting, detectedLanguage]);

  const setLanguageSetting = (lang: LangSetting) => {
    setLanguageSettingState(lang);
    localStorage.setItem("mimoe_lang", lang);
  };

  const t = (key: keyof typeof translations.fr): string => {
    return translations[currentLanguage][key] || translations["en"][key] || key;
  };

  const value = useMemo(
    () => ({
      languageSetting,
      currentLanguage,
      setLanguageSetting,
      t,
    }),
    [languageSetting, currentLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
