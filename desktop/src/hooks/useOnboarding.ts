import { useCallback, useState } from "react";
import { pair } from "../lib/api";
import { tauri } from "../lib/tauri";
import type { AuthMode, FrontendConfig } from "../lib/types";

export const OB_STEPS = 4;

export interface OnboardData {
  server: string;
  email: string;
  password: string;
  passphrase: string;
}

const EMPTY: OnboardData = { server: "", email: "", password: "", passphrase: "" };

/** Machine à états du wizard d'appairage. */
export function useOnboarding(onPaired: (config: FrontendConfig) => void) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AuthMode>("register");
  const [data, setData] = useState<OnboardData>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setField = useCallback((key: keyof OnboardData, value: string) => {
    setData((d) => ({ ...d, [key]: value }));
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "register" ? "login" : "register"));
  }, []);

  const back = useCallback(() => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const doPair = useCallback(async () => {
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
        passphrase: data.passphrase,
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
  }, [data, mode, onPaired]);

  const next = useCallback(() => {
    setError("");
    if (step === 1) {
      const s = data.server.trim().replace(/\/+$/, "");
      if (!s) return setError("Renseigne l'adresse du serveur.");
      setData((d) => ({ ...d, server: s }));
    } else if (step === 2) {
      if (!data.email.trim() || !data.password)
        return setError("Email et mot de passe requis.");
    } else if (step === 3) {
      if (!data.passphrase) return setError("La passphrase est requise.");
      return doPair();
    }
    setStep((s) => s + 1);
  }, [step, data, doPair]);

  return { step, mode, data, error, busy, setField, toggleMode, back, next };
}
