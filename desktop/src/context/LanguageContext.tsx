import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "fr" | "en" | "es" | "pt";
export type LangSetting = "system" | "fr" | "en" | "es" | "pt";

const translations = {
  fr: {
    // SearchHeader
    searchPlaceholder: "Rechercher dans l'historique...",
    clear: "Vider",
    settingsTitle: "Réglages (⌘,)",
    settingsLabel: "Réglages",
    pauseTitle: "Mettre en pause la synchro",
    resumeTitle: "Reprendre la synchro",
    pausedBanner: "Synchro en pause — tes copies restent sur ce Mac",

    // Footer
    navigate: "naviguer",
    copy: "copier",
    close: "fermer",
    wsConnected: "WebSocket : Connecté",
    wsConnecting: "WebSocket : Connexion...",
    wsError: "WebSocket : Erreur",

    // EmptyState
    emptyNoResults: "Aucun résultat.",
    emptyDefault: "Rien pour l'instant.",
    emptyHint: "Copie sur un appareil → ça arrive ici.",

    // ClipCard
    copied: "Copié",
    sensitive: "sensible",
    thisMac: "ce Mac",
    received: "reçu",
    hide: "Masquer",
    show: "Afficher",
    delete: "Supprimer (⌘⌫)",
    open: "Ouvrir",

    // Settings
    back: "Retour (esc)",
    connexion: "Connexion",
    server: "Serveur",
    device: "Cet appareil",
    preferences: "Préférences",
    soundOnArrival: "Son à l'arrivée d'un clip",
    soundDesc: "Petit « pop » quand un clip arrive",
    language: "Langue",
    langSystem: "Système",
    security: "Sécurité",
    securityDesc1: "Les copies marquées sensibles (mots de passe) sont ignorées automatiquement — jamais chiffrées ni envoyées.",
    securityDesc2: "Historique : 24 h ou 100 derniers clips. Le serveur ne voit que du contenu chiffré.",
    unpairButton: "Désappairer ce Mac",
    unpairConfirm: "Désappairer ? Il faudra te reconnecter.",
    blacklist: "Apps ignorées",
    blacklistDesc: "Les copies faites depuis ces apps ne sont jamais synchronisées.",
    blacklistAdd: "Ajouter une app",
    blacklistEmpty: "Aucune app ignorée.",
    blacklistPick: "Choisir une app en cours",
    blacklistSearch: "Rechercher une app…",
    blacklistLoading: "Chargement des apps…",
    cancel: "Annuler",

    // Onboarding
    onboardingTitle0: "Ton presse-papier, partout.",
    onboardingSub0: "Copie sur ton téléphone, colle sur ton Mac. Chiffré de bout en bout, sur ton propre serveur.",
    onboardingCta0: "Commencer",
    
    onboardingTitle1: "Ton serveur",
    onboardingSub1: "L'adresse de ton instance Clipd. C'est le seul point de rendez-vous — il ne voit jamais tes données en clair.",
    onboardingCta1: "Continuer",
    
    onboardingTitle2Register: "Crée ton compte",
    onboardingTitle2Login: "Connecte-toi",
    onboardingSub2: "Ton compte relie tous tes appareils. Historique isolé, rien que le tien.",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Mot de passe",
    hasAccount: "Déjà un compte ?",
    noAccount: "Pas de compte ?",
    loginLink: "Se connecter",
    registerLink: "Créer un compte",
    onboardingCta2: "Continuer",
    
    onboardingTitle3: "La clé secrète",
    onboardingSub3: "Une passphrase que tu tapes sur chacun de tes appareils. Elle chiffre tout et ne quitte jamais ce Mac.",
    passphrasePlaceholder: "Passphrase partagée",
    onboardingCta3Busy: "Connexion…",
    onboardingCta3: "Terminer",
  },
  en: {
    // SearchHeader
    searchPlaceholder: "Search history...",
    clear: "Clear",
    settingsTitle: "Settings (⌘,)",
    settingsLabel: "Settings",
    pauseTitle: "Pause sync",
    resumeTitle: "Resume sync",
    pausedBanner: "Sync paused — your copies stay on this Mac",

    // Footer
    navigate: "navigate",
    copy: "copy",
    close: "close",
    wsConnected: "WebSocket: Connected",
    wsConnecting: "WebSocket: Connecting...",
    wsError: "WebSocket: Error",

    // EmptyState
    emptyNoResults: "No results.",
    emptyDefault: "Nothing here yet.",
    emptyHint: "Copy on a device → it appears here.",

    // ClipCard
    copied: "Copied",
    sensitive: "sensitive",
    thisMac: "this Mac",
    received: "received",
    hide: "Hide",
    show: "Show",
    delete: "Delete (⌘⌫)",
    open: "Open",

    // Settings
    back: "Back (esc)",
    connexion: "Connection",
    server: "Server",
    device: "This device",
    preferences: "Preferences",
    soundOnArrival: "Sound on clip arrival",
    soundDesc: "Play a small \"pop\" sound when a clip arrives",
    language: "Language",
    langSystem: "System",
    security: "Security",
    securityDesc1: "Copies marked as sensitive (passwords) are ignored automatically — never encrypted or sent.",
    securityDesc2: "History: 24h or last 100 clips. The server only sees encrypted content.",
    unpairButton: "Unpair this Mac",
    unpairConfirm: "Unpair? You will have to sign in again.",
    blacklist: "Ignored apps",
    blacklistDesc: "Copies made from these apps are never synced.",
    blacklistAdd: "Add an app",
    blacklistEmpty: "No ignored app.",
    blacklistPick: "Pick a running app",
    blacklistSearch: "Search an app…",
    blacklistLoading: "Loading apps…",
    cancel: "Cancel",

    // Onboarding
    onboardingTitle0: "Your clipboard, everywhere.",
    onboardingSub0: "Copy on your phone, paste on your Mac. End-to-end encrypted, on your own server.",
    onboardingCta0: "Get Started",
    
    onboardingTitle1: "Your server",
    onboardingSub1: "The URL of your Clipd instance. It is the only meeting point — it never sees your clear data.",
    onboardingCta1: "Continue",
    
    onboardingTitle2Register: "Create your account",
    onboardingTitle2Login: "Sign in",
    onboardingSub2: "Your account connects all your devices. Isolated history, only yours.",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    hasAccount: "Already have an account?",
    noAccount: "No account?",
    loginLink: "Sign in",
    registerLink: "Create an account",
    onboardingCta2: "Continue",
    
    onboardingTitle3: "The secret key",
    onboardingSub3: "A passphrase you type on each of your devices. It encrypts everything and never leaves this Mac.",
    passphrasePlaceholder: "Shared passphrase",
    onboardingCta3Busy: "Connecting...",
    onboardingCta3: "Finish",
  },
  es: {
    // SearchHeader
    searchPlaceholder: "Buscar en el historial...",
    clear: "Limpiar",
    settingsTitle: "Ajustes (⌘,)",
    settingsLabel: "Ajustes",
    pauseTitle: "Pausar la sincronización",
    resumeTitle: "Reanudar la sincronización",
    pausedBanner: "Sincronización en pausa — tus copias se quedan en este Mac",

    // Footer
    navigate: "navegar",
    copy: "copiar",
    close: "cerrar",
    wsConnected: "WebSocket: Conectado",
    wsConnecting: "WebSocket: Conectando...",
    wsError: "WebSocket: Error",

    // EmptyState
    emptyNoResults: "Sin resultados.",
    emptyDefault: "Nada por aquí todavía.",
    emptyHint: "Copia en un dispositivo → aparece aquí.",

    // ClipCard
    copied: "Copiado",
    sensitive: "sensible",
    thisMac: "este Mac",
    received: "recibido",
    hide: "Ocultar",
    show: "Mostrar",
    delete: "Eliminar (⌘⌫)",
    open: "Abrir",

    // Settings
    back: "Atrás (esc)",
    connexion: "Conexión",
    server: "Servidor",
    device: "Este dispositivo",
    preferences: "Preferencias",
    soundOnArrival: "Sonido al recibir un clip",
    soundDesc: "Un pequeño «pop» cuando llega un clip",
    language: "Idioma",
    langSystem: "Sistema",
    security: "Seguridad",
    securityDesc1: "Las copias marcadas como sensibles (contraseñas) se ignoran automáticamente; nunca se cifran ni se envían.",
    securityDesc2: "Historial: 24 h o los últimos 100 clips. El servidor solo ve contenido cifrado.",
    unpairButton: "Desvincular este Mac",
    unpairConfirm: "¿Desvincular? Tendrás que volver a conectarte.",
    blacklist: "Apps ignoradas",
    blacklistDesc: "Las copias hechas desde estas apps nunca se sincronizan.",
    blacklistAdd: "Añadir una app",
    blacklistEmpty: "Ninguna app ignorada.",
    blacklistPick: "Elegir una app en ejecución",
    blacklistSearch: "Buscar una app…",
    blacklistLoading: "Cargando apps…",
    cancel: "Cancelar",

    // Onboarding
    onboardingTitle0: "Tu portapapeles, en todas partes.",
    onboardingSub0: "Copia en tu teléfono, pega en tu Mac. Cifrado de extremo a extremo, en tu propio servidor.",
    onboardingCta0: "Empezar",
    
    onboardingTitle1: "Tu servidor",
    onboardingSub1: "La dirección de tu instancia de Clipd. Es el único punto de encuentro; nunca ve tus datos en claro.",
    onboardingCta1: "Continuar",
    
    onboardingTitle2Register: "Crea tu cuenta",
    onboardingTitle2Login: "Iniciar sesión",
    onboardingSub2: "Tu cuenta conecta todos tus dispositivos. Historial aislado, solo el tuyo.",
    emailPlaceholder: "Correo electrónico",
    passwordPlaceholder: "Contraseña",
    hasAccount: "¿Ya tienes una cuenta?",
    noAccount: "¿No tienes una cuenta?",
    loginLink: "Iniciar sesión",
    registerLink: "Crear una cuenta",
    onboardingCta2: "Continuar",
    
    onboardingTitle3: "La clave secreta",
    onboardingSub3: "Una frase de contraseña que escribes en cada uno de tus dispositivos. Cifra todo y nunca sale de este Mac.",
    passphrasePlaceholder: "Frase de contraseña compartida",
    onboardingCta3Busy: "Conectando...",
    onboardingCta3: "Terminar",
  },
  pt: {
    // SearchHeader
    searchPlaceholder: "Buscar no histórico...",
    clear: "Limpar",
    settingsTitle: "Ajustes (⌘,)",
    settingsLabel: "Ajustes",
    pauseTitle: "Pausar a sincronização",
    resumeTitle: "Retomar a sincronização",
    pausedBanner: "Sincronização em pausa — suas cópias ficam neste Mac",

    // Footer
    navigate: "navegar",
    copy: "copiar",
    close: "fechar",
    wsConnected: "WebSocket: Conectado",
    wsConnecting: "WebSocket: Conectando...",
    wsError: "WebSocket: Erro",

    // EmptyState
    emptyNoResults: "Sem resultados.",
    emptyDefault: "Nada por aqui ainda.",
    emptyHint: "Copie em um dispositivo → aparece aqui.",

    // ClipCard
    copied: "Copiado",
    sensitive: "sensível",
    thisMac: "este Mac",
    received: "recebido",
    hide: "Ocultar",
    show: "Mostrar",
    delete: "Excluir (⌘⌫)",
    open: "Abrir",

    // Settings
    back: "Voltar (esc)",
    connexion: "Conexão",
    server: "Servidor",
    device: "Este dispositivo",
    preferences: "Preferências",
    soundOnArrival: "Som ao receber um clip",
    soundDesc: "Um pequeno «pop» quando um clip chega",
    language: "Idioma",
    langSystem: "Sistema",
    security: "Segurança",
    securityDesc1: "As cópias marcadas como sensíveis (senhas) são ignoradas automaticamente — nunca criptografadas ou enviadas.",
    securityDesc2: "Histórico: 24h ou últimos 100 clips. O servidor só vê conteúdo criptografado.",
    unpairButton: "Desvincular este Mac",
    unpairConfirm: "Desvincular? Você precisará se conectar novamente.",
    blacklist: "Apps ignorados",
    blacklistDesc: "As cópias feitas nesses apps nunca são sincronizadas.",
    blacklistAdd: "Adicionar um app",
    blacklistEmpty: "Nenhum app ignorado.",
    blacklistPick: "Escolher um app em execução",
    blacklistSearch: "Buscar um app…",
    blacklistLoading: "Carregando apps…",
    cancel: "Cancelar",

    // Onboarding
    onboardingTitle0: "Sua área de transferência, em todos os lugares.",
    onboardingSub0: "Copie no telefone, cole no Mac. Criptografado de ponta a ponta, no seu próprio servidor.",
    onboardingCta0: "Começar",
    
    onboardingTitle1: "Seu servidor",
    onboardingSub1: "O endereço da sua instância do Clipd. É o único ponto de encontro — ele nunca vê seus dados em texto simples.",
    onboardingCta1: "Continuar",
    
    onboardingTitle2Register: "Crie sua conta",
    onboardingTitle2Login: "Entrar",
    onboardingSub2: "Sua conta conecta todos os seus dispositivos. Histórico isolado, apenas o seu.",
    emailPlaceholder: "E-mail",
    passwordPlaceholder: "Senha",
    hasAccount: "Já tem uma conta?",
    noAccount: "Não tem uma conta?",
    loginLink: "Entrar",
    registerLink: "Criar uma conta",
    onboardingCta2: "Continuar",
    
    onboardingTitle3: "A chave secreta",
    onboardingSub3: "Uma frase secreta que você digita em cada um de seus dispositivos. Ela criptografa tudo e nunca sai deste Mac.",
    passphrasePlaceholder: "Frase secreta compartilhada",
    onboardingCta3Busy: "Conectando...",
    onboardingCta3: "Terminar",
  },
};

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
    return (localStorage.getItem("clipd_lang") as LangSetting) || "system";
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
    localStorage.setItem("clipd_lang", lang);
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
