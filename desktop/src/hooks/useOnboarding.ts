import { useCallback, useState } from "react";
import { pair } from "../lib/api";
import { tauri } from "../lib/tauri";
import type { AuthMode, FrontendConfig } from "../lib/types";

export const OB_STEPS = 4;

/** Nombre de mots redemandés à la vérification. Positions tirées au hasard. */
const QUIZ_COUNT = 4;

export interface OnboardData {
  server: string;
  email: string;
  password: string;
  passphrase: string;
}

/** Étape 3 en mode register : on affiche la seed, puis on vérifie qu'elle est notée. */
export type SeedPhase = "reveal" | "quiz";

const EMPTY: OnboardData = { server: "", email: "", password: "", passphrase: "" };

/** Tire `n` positions distinctes dans [0, total), triées. */
function pickPositions(total: number, n: number): number[] {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

/** Machine à états du wizard d'appairage. */
export function useOnboarding(onPaired: (config: FrontendConfig) => void) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AuthMode>("register");
  const [data, setData] = useState<OnboardData>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Étape 3, mode register.
  const [words, setWords] = useState<string[]>([]);
  const [seedPhase, setSeedPhase] = useState<SeedPhase>("reveal");
  const [quizPositions, setQuizPositions] = useState<number[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

  const setField = useCallback((key: keyof OnboardData, value: string) => {
    setData((d) => ({ ...d, [key]: value }));
  }, []);

  const setQuizAnswer = useCallback((pos: number, value: string) => {
    setQuizAnswers((a) => ({ ...a, [pos]: value }));
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "register" ? "login" : "register"));
  }, []);

  const back = useCallback(() => {
    setError("");
    // Depuis le quiz on revient à la seed, pas à l'étape précédente : l'utilisateur
    // a besoin de relire ses mots s'il a raté la vérification.
    if (step === 3 && seedPhase === "quiz") {
      setQuizAnswers({});
      return setSeedPhase("reveal");
    }
    setStep((s) => Math.max(0, s - 1));
  }, [step, seedPhase]);

  const doPair = useCallback(
    async (passphrase: string) => {
      setBusy(true);
      setError("");
      try {
        const deviceId = crypto.randomUUID();
        const r = await pair(data.server, mode, data.email, data.password, deviceId);
        await tauri.setup({
          serverUrl: data.server,
          deviceId,
          deviceToken: r.token,
          userId: r.user_id,
          passphrase,
          reverbAppKey: r.reverb_app_key,
          reverbHost: r.reverb_host,
          reverbPort: r.reverb_port,
          reverbScheme: r.reverb_scheme,
        });
        const config = await tauri.getConfig();
        onPaired(config);
      } catch (e: any) {
        setBusy(false);
        setStep(3);
        setError(`Échec : ${e?.message ?? e}`);
      }
    },
    [data, mode, onPaired],
  );

  /** Génère la seed avant d'entrer sur l'étape 3 (register). */
  const enterSeedStep = useCallback(async () => {
    setBusy(true);
    try {
      const w = await tauri.generateSeed();
      setWords(w);
      setQuizPositions(pickPositions(w.length, QUIZ_COUNT));
      setQuizAnswers({});
      setSeedPhase("reveal");
      setStep(3);
    } catch (e: any) {
      setError(`Génération de la seed impossible : ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const submitQuiz = useCallback(() => {
    const wrong = quizPositions.filter(
      (p) => (quizAnswers[p] ?? "").trim().toLowerCase() !== words[p],
    );
    if (wrong.length) {
      return setError(
        wrong.length === 1
          ? `Le mot ${wrong[0] + 1} ne correspond pas.`
          : `${wrong.length} mots ne correspondent pas.`,
      );
    }
    return doPair(words.join(" "));
  }, [quizPositions, quizAnswers, words, doPair]);

  /** Mode login : la seed est saisie. On valide wordlist + checksum avant d'appairer. */
  const submitTypedSeed = useCallback(async () => {
    setError("");
    try {
      await tauri.validateSeed(data.passphrase);
    } catch (e: any) {
      return setError(String(e?.message ?? e));
    }
    return doPair(data.passphrase);
  }, [data.passphrase, doPair]);

  const next = useCallback(() => {
    setError("");
    if (step === 1) {
      const s = data.server.trim().replace(/\/+$/, "");
      if (!s) return setError("Renseigne l'adresse du serveur.");
      setData((d) => ({ ...d, server: s }));
    } else if (step === 2) {
      if (!data.email.trim() || !data.password)
        return setError("Email et mot de passe requis.");
      // La seed n'est générée que pour un nouveau compte ; un appareil
      // supplémentaire se connecte au compte existant et saisit la seed existante.
      if (mode === "register") return void enterSeedStep();
    } else if (step === 3) {
      if (mode === "login") return void submitTypedSeed();
      if (seedPhase === "reveal") return setSeedPhase("quiz");
      return submitQuiz();
    }
    setStep((s) => s + 1);
  }, [step, mode, data, seedPhase, enterSeedStep, submitQuiz, submitTypedSeed]);

  return {
    step,
    mode,
    data,
    error,
    busy,
    words,
    seedPhase,
    quizPositions,
    quizAnswers,
    setField,
    setQuizAnswer,
    toggleMode,
    back,
    next,
  };
}
