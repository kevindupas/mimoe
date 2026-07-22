import { useCallback, useState } from "react";
import { fetchServerInfo, pair } from "../lib/api";
import { serverUrlError } from "../lib/serverUrl";
import { tauri } from "../lib/tauri";
import type { AuthMode, FrontendConfig } from "../lib/types";

export const OB_STEPS = 4;

/** Number of words asked again at verification. Positions picked at random. */
const QUIZ_COUNT = 4;

export interface OnboardData {
  server: string;
  email: string;
  password: string;
  passphrase: string;
}

/** Step 3 in register mode: we show the seed, then verify it has been written down. */
export type SeedPhase = "reveal" | "quiz";

const EMPTY: OnboardData = { server: "", email: "", password: "", passphrase: "" };

/** Picks `n` distinct positions in [0, total), sorted. */
function pickPositions(total: number, n: number): number[] {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

/** State machine for the pairing wizard. */
export function useOnboarding(onPaired: (config: FrontendConfig) => void) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AuthMode>("register");
  const [data, setData] = useState<OnboardData>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** Closed instance: we switch to login and hide account creation. */
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  // Step 3, register mode.
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
    if (!registrationEnabled) return;
    setMode((m) => (m === "register" ? "login" : "register"));
  }, [registrationEnabled]);

  /**
   * Queries the instance as soon as its URL is known, so as not to let the
   * user fill out a registration form and hit a 403 after having written down
   * their 12 words.
   */
  const checkServer = useCallback(async (serverUrl: string) => {
    setBusy(true);
    try {
      const { registrationEnabled: open } = await fetchServerInfo(serverUrl);
      setRegistrationEnabled(open);
      if (!open) setMode("login");
      setStep(2);
    } finally {
      setBusy(false);
    }
  }, []);

  const back = useCallback(() => {
    setError("");
    // From the quiz we go back to the seed, not the previous step: the user
    // needs to re-read their words if they failed the verification.
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
          email: data.email,
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
        setError(`Failed: ${e?.message ?? e}`);
      }
    },
    [data, mode, onPaired],
  );

  /** Generates the seed before entering step 3 (register). */
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
      setError(`Could not generate the seed: ${e?.message ?? e}`);
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
          ? `Word ${wrong[0] + 1} doesn't match.`
          : `${wrong.length} words don't match.`,
      );
    }
    return doPair(words.join(" "));
  }, [quizPositions, quizAnswers, words, doPair]);

  /** Login mode: the seed is typed in. We validate wordlist + checksum before pairing. */
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
      if (!s) return setError("Enter the server address.");
      const urlErr = serverUrlError(s);
      if (urlErr) return setError(urlErr);
      setData((d) => ({ ...d, server: s }));
      return void checkServer(s);
    } else if (step === 2) {
      if (!data.email.trim() || !data.password)
        return setError("Email and password required.");
      // The seed is only generated for a new account; an additional
      // device connects to the existing account and types in the existing seed.
      if (mode === "register") return void enterSeedStep();
    } else if (step === 3) {
      if (mode === "login") return void submitTypedSeed();
      if (seedPhase === "reveal") return setSeedPhase("quiz");
      return submitQuiz();
    }
    setStep((s) => s + 1);
  }, [step, mode, data, seedPhase, checkServer, enterSeedStep, submitQuiz, submitTypedSeed]);

  return {
    step,
    mode,
    data,
    error,
    busy,
    registrationEnabled,
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
