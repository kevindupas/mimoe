import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";
import { auth, fetchServerInfo, newDeviceId } from "../api";
import { useLanguage } from "../i18n";
import { IlluDevice, IlluLock, IlluServer, IlluSync } from "./Illustrations";
import { deriveKey } from "../crypto";
import { generateSeed, normalizeSeed, unknownWords, validateSeed } from "../seed";
import { saveConfig } from "../store";


/** Nombre de mots redemandés à la vérification. Positions tirées au hasard. */
const QUIZ_COUNT = 4;

/** Tire `n` positions distinctes dans [0, total), triées. */
function pickPositions(total: number, n: number): number[] {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

export default function Onboarding({ p, onDone }: { p: Palette; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [server, setServer] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [register, setRegister] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Étape 3, mode register : la seed est générée puis vérifiée.
  const [words, setWords] = useState<string[]>([]);
  const [seedPhase, setSeedPhase] = useState<"reveal" | "quiz">("reveal");
  const [quizPositions, setQuizPositions] = useState<number[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState(false);
  /** Instance fermée : on bascule en connexion et on masque la création de compte. */
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  const s = styles(p);
  const seedScreen = step === 3 && register;

  const ILLUS = [
    <IlluSync p={p} />,
    <IlluServer p={p} />,
    <IlluDevice p={p} />,
    <IlluLock p={p} />,
  ];
  const seedWords = passphrase.trim() ? normalizeSeed(passphrase).split(" ").filter(Boolean) : [];
  const seedUnknown = unknownWords(passphrase);

  const titles = [
    t("obTitle0"),
    t("obTitle1"),
    register && registrationEnabled ? t("obTitle2Register") : t("obTitle2Login"),
    register ? (seedPhase === "reveal" ? t("seedRevealTitle") : t("seedQuizTitle")) : t("seedInputTitle"),
  ];
  const subs = [
    t("obSub0"),
    t("obSub1"),
    registrationEnabled
      ? t("obSub2")
      : t("registrationClosedSub"),
    register
      ? seedPhase === "reveal"
        ? t("seedRevealSub")
        : t("seedQuizSub")
      : t("seedInputSub"),
  ];

  async function finish(seed: string) {
    setBusy(true); setError("");
    try {
      const url = server.trim().replace(/\/+$/, "");
      const deviceId = newDeviceId();
      const res = await auth(url, register ? "register" : "login", email.trim(), password, deviceId);
      // Normalisation avant dérivation : miroir strict de setup() côté Rust.
      // Sans elle, un formatage différent produirait une clé différente.
      const key = await deriveKey(normalizeSeed(seed));
      await saveConfig({
        serverUrl: url, deviceId, userId: res.userId, deviceToken: res.token,
        reverbAppKey: res.reverbAppKey, reverbPort: res.reverbPort,
      }, key);
      onDone();
    } catch (e: any) {
      setError(`${t("obFailed")}${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  /** Génère la seed avant d'entrer sur l'étape 3 (nouveau compte uniquement). */
  function enterSeedStep() {
    try {
      const w = generateSeed();
      setWords(w);
      setQuizPositions(pickPositions(w.length, QUIZ_COUNT));
      setQuizAnswers({});
      setSeedPhase("reveal");
      setStep(3);
    } catch (e: any) {
      setError(`${t("seedGenFailed")}${e.message ?? e}`);
    }
  }

  function submitQuiz() {
    const wrong = quizPositions.filter(
      (pos) => (quizAnswers[pos] ?? "").trim().toLowerCase() !== words[pos],
    );
    if (wrong.length) {
      return setError(
        wrong.length === 1
          ? t("seedWordMismatch").replace("{n}", String(wrong[0] + 1))
          : t("seedWordsMismatch").replace("{n}", String(wrong.length)),
      );
    }
    return finish(words.join(" "));
  }

  /**
   * Interroge l'instance dès que son URL est connue, pour ne pas laisser
   * l'utilisateur remplir une inscription et se prendre un 403 après avoir noté
   * ses 12 mots.
   */
  async function checkServer(url: string) {
    setBusy(true);
    try {
      const { registrationEnabled: open } = await fetchServerInfo(url);
      setRegistrationEnabled(open);
      if (!open) setRegister(false);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setError("");
    if (step === 1) {
      const url = server.trim().replace(/\/+$/, "");
      if (!url) return setError(t("obNeedServer"));
      return void checkServer(url);
    }
    if (step === 2) {
      if (!email.trim() || !password) return setError(t("obNeedCreds"));
      // La seed n'est générée que pour un nouveau compte ; un appareil de plus se
      // connecte au compte existant et saisit la seed existante.
      if (register) return enterSeedStep();
    }
    if (step === 3) {
      if (!register) {
        const err = validateSeed(passphrase);
        if (err) return setError(err);
        return finish(passphrase);
      }
      if (seedPhase === "reveal") return setSeedPhase("quiz");
      return submitQuiz();
    }
    setStep(step + 1);
  }

  /**
   * expo-clipboard n'expose aucun marqueur "sensible" (Android a
   * ClipDescription.EXTRA_IS_SENSITIVE depuis l'API 33, non remonté par Expo).
   * La copie reste préférable au screenshot, qui finit dans Google Photos.
   */
  async function copySeed() {
    await Clipboard.setStringAsync(words.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function cta() {
    if (step === 0) return t("obStart");
    if (step !== 3) return t("obContinue");
    if (!register) return t("seedInputCta");
    return seedPhase === "reveal" ? t("seedRevealCta") : t("obFinish");
  }

  function back() {
    setError("");
    // Depuis le quiz on revient à la seed : l'utilisateur doit pouvoir relire ses mots.
    if (step === 3 && register && seedPhase === "quiz") {
      setQuizAnswers({});
      return setSeedPhase("reveal");
    }
    setStep(step - 1);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        {step > 0 ? (
          <Pressable onPress={back} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={p.text} />
          </Pressable>
        ) : (
          <View style={s.brand}><View style={s.dot} /><Text style={s.brandTxt}>Mimoe</Text></View>
        )}
        <View style={s.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[s.pip, i === step && s.pipOn, i <= step && s.pipDone]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
      <View style={s.body}>
        {/* Les écrans seed n'ont pas d'illustration : les 12 mots prennent la place. */}
        {!seedScreen && <View style={s.illu}>{ILLUS[step]}</View>}
        <Text style={s.title}>{titles[step]}</Text>
        <Text style={s.sub}>{subs[step]}</Text>

        <View style={s.fields}>
          {step === 1 && (
            <TextInput style={s.input} placeholder="https://sync.mimoe.app" placeholderTextColor={p.textFaint}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" value={server} onChangeText={setServer} />
          )}
          {step === 2 && (
            <>
              <TextInput style={s.input} placeholder={t("obEmail")} placeholderTextColor={p.textFaint}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TextInput style={s.input} placeholder={t("obPassword")} placeholderTextColor={p.textFaint}
                secureTextEntry value={password} onChangeText={setPassword} />
              {/* Instance fermée : pas de bascule vers l'inscription — la proposer
                  mènerait à un 403 après avoir fait noter les 12 mots. */}
              {registrationEnabled ? (
                <Pressable onPress={() => setRegister(!register)}>
                  <Text style={s.toggle}>
                    {register ? t("obHasAccount") : t("obNoAccount")}
                    <Text style={s.toggleLink}>{register ? t("obLoginLink") : t("obRegisterLink")}</Text>
                  </Text>
                </Pressable>
              ) : (
                <View style={s.closed}>
                  <Ionicons name="shield-outline" size={14} color={p.textDim} />
                  <Text style={s.closedTxt}>
                    Ce serveur n'accepte pas de nouvelles inscriptions. Il te faut un compte déjà
                    créé par son administrateur.
                  </Text>
                </View>
              )}
            </>
          )}
          {step === 3 && !register && (
            <>
              <TextInput style={[s.input, s.seedInput]} placeholder={t("seedInputPlaceholder")}
                placeholderTextColor={p.textFaint} autoCapitalize="none" autoCorrect={false}
                autoComplete="off" multiline value={passphrase} onChangeText={setPassphrase} />
              <View style={s.seedMeta}>
                <Text style={[s.seedCount, seedWords.length === 12 && { color: p.accent }]}>
                  {seedWords.length}/12
                </Text>
                {seedUnknown.length > 0 && (
                  <Text style={s.seedUnknown} numberOfLines={1}>
                    {t("seedInputUnknown")} {seedUnknown.slice(0, 2).join(", ")}{seedUnknown.length > 2 ? "…" : ""}
                  </Text>
                )}
              </View>
            </>
          )}

          {step === 3 && register && seedPhase === "reveal" && (
            <>
              <View style={s.seedGrid}>
                {words.map((w, i) => (
                  <View key={i} style={s.seedCell}>
                    <Text style={s.seedNum}>{i + 1}</Text>
                    <Text style={s.seedWord}>{w}</Text>
                  </View>
                ))}
              </View>
              <Pressable style={s.copyBtn} onPress={copySeed}>
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={13} color={p.accent} />
                <Text style={s.copyTxt}>{copied ? t("seedCopied") : t("seedCopy")}</Text>
              </Pressable>

              <View style={s.warn}>
                <Ionicons name="shield-outline" size={14} color={p.danger} />
                <Text style={s.warnTxt}>
                  Papier ou gestionnaire de mots de passe. Évite la capture d'écran : elle part dans Google Photos, et ta clé avec.
                </Text>
              </View>
            </>
          )}

          {step === 3 && register && seedPhase === "quiz" && (
            <View style={s.quizGrid}>
              {quizPositions.map((pos) => (
                <View key={pos} style={s.quizCell}>
                  <Text style={s.quizLabel}>{t("seedQuizWord")} {pos + 1}</Text>
                  <TextInput style={[s.input, s.quizInput]} autoCapitalize="none" autoCorrect={false}
                    autoComplete="off" value={quizAnswers[pos] ?? ""}
                    onChangeText={(v) => setQuizAnswers((a) => ({ ...a, [pos]: v }))} />
                </View>
              ))}
            </View>
          )}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      <View style={[s.foot, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={next}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{cta()}</Text>}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (p: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: p.bg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent },
  brandTxt: { color: p.text, fontWeight: "600", fontSize: 15 },
  dots: { flexDirection: "row", gap: 6 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: p.border },
  pipOn: { width: 20 },
  pipDone: { backgroundColor: p.accent },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  // Pas de pastille de fond : les illustrations portent le sens, un rond les enfermerait.
  illu: { height: 110, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { color: p.text, fontSize: 26, fontWeight: "700", textAlign: "center", letterSpacing: -0.5 },
  sub: { color: p.textDim, fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: 10, maxWidth: 320 },
  fields: { width: "100%", gap: 10, marginTop: 22 },
  input: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: p.text, textAlign: "center" },
  seedInput: { textAlign: "center", minHeight: 90, paddingTop: 14, textAlignVertical: "top", fontFamily: "Menlo" },
  seedMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  seedCount: { color: p.textFaint, fontSize: 12, fontVariant: ["tabular-nums"] },
  seedUnknown: { color: p.danger, fontSize: 12, flexShrink: 1, paddingLeft: 8 },
  seedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seedCell: {
    flexDirection: "row", alignItems: "center", gap: 8, width: "47%",
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  },
  seedNum: { color: p.textFaint, fontSize: 11, width: 14, textAlign: "right", fontVariant: ["tabular-nums"] },
  seedWord: { color: p.text, fontSize: 14, fontWeight: "500", fontFamily: "Menlo" },
  warn: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4,
    backgroundColor: p.danger + "14", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  },
  warnTxt: { color: p.danger, fontSize: 11.5, lineHeight: 16, flexShrink: 1 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    alignSelf: "center", backgroundColor: p.accentSoft, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  copyTxt: { color: p.accent, fontSize: 12.5, fontWeight: "600" },
  quizGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quizCell: { width: "47%", gap: 5 },
  quizLabel: { color: p.textFaint, fontSize: 11, fontWeight: "500" },
  quizInput: { paddingVertical: 11, fontSize: 14, fontFamily: "Menlo" },
  closed: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
  },
  closedTxt: { color: p.textDim, fontSize: 11.5, lineHeight: 16, flexShrink: 1 },
  toggle: { color: p.textDim, fontSize: 13, textAlign: "center", marginTop: 4 },
  toggleLink: { color: p.accent, fontWeight: "600" },
  error: { color: p.danger, fontSize: 13, textAlign: "center", marginTop: 14 },
  foot: { paddingHorizontal: 24, paddingTop: 8 },
  btn: { backgroundColor: p.accent, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
