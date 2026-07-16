import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";
import { auth, newDeviceId } from "../api";
import { deriveKey } from "../crypto";
import { generateSeed, normalizeSeed, unknownWords, validateSeed } from "../seed";
import { saveConfig } from "../store";

const ICONS: any = ["phone-portrait-outline", "cloud-outline", "person-outline", "lock-closed-outline"];

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

  const s = styles(p);
  const seedScreen = step === 3 && register;
  const seedWords = passphrase.trim() ? normalizeSeed(passphrase).split(" ").filter(Boolean) : [];
  const seedUnknown = unknownWords(passphrase);

  const titles = [
    "Ton presse-papier, partout.",
    "Ton serveur",
    register ? "Crée ton compte" : "Connecte-toi",
    register ? (seedPhase === "reveal" ? "Note ces 12 mots" : "Vérifions") : "Ta seed phrase",
  ];
  const subs = [
    "Copie sur ton téléphone, colle sur ton ordi. Chiffré de bout en bout, sur ton propre serveur.",
    "L'adresse de ton instance Mimoe. Il ne voit jamais tes données en clair.",
    "Ton compte relie tous tes appareils. Historique isolé, rien que le tien.",
    register
      ? seedPhase === "reveal"
        ? "Ils dérivent ta clé de chiffrement. Sans eux, aucun autre appareil ne pourra lire ton presse-papier."
        : "Recopie les mots demandés pour confirmer que tu les as bien notés."
      : "Saisis les 12 mots affichés lors de la création de ton compte. C'est eux qui dérivent ta clé de chiffrement.",
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
      setError(`Échec : ${e.message ?? e}`);
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
      setError(`Génération de la seed impossible : ${e.message ?? e}`);
    }
  }

  function submitQuiz() {
    const wrong = quizPositions.filter(
      (pos) => (quizAnswers[pos] ?? "").trim().toLowerCase() !== words[pos],
    );
    if (wrong.length) {
      return setError(
        wrong.length === 1
          ? `Le mot ${wrong[0] + 1} ne correspond pas.`
          : `${wrong.length} mots ne correspondent pas.`,
      );
    }
    return finish(words.join(" "));
  }

  function next() {
    setError("");
    if (step === 1 && !server.trim()) return setError("Renseigne le serveur.");
    if (step === 2) {
      if (!email.trim() || !password) return setError("Email et mot de passe requis.");
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
    if (step === 0) return "Commencer";
    if (step !== 3) return "Continuer";
    if (!register) return "Se connecter";
    return seedPhase === "reveal" ? "Je les ai notés" : "Terminer";
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
        {!seedScreen && (
          <View style={s.illu}><Ionicons name={ICONS[step]} size={48} color={p.accent} /></View>
        )}
        <Text style={s.title}>{titles[step]}</Text>
        <Text style={s.sub}>{subs[step]}</Text>

        <View style={s.fields}>
          {step === 1 && (
            <TextInput style={s.input} placeholder="https://sync.mimoe.app" placeholderTextColor={p.textFaint}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" value={server} onChangeText={setServer} />
          )}
          {step === 2 && (
            <>
              <TextInput style={s.input} placeholder="Email" placeholderTextColor={p.textFaint}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TextInput style={s.input} placeholder="Mot de passe" placeholderTextColor={p.textFaint}
                secureTextEntry value={password} onChangeText={setPassword} />
              <Pressable onPress={() => setRegister(!register)}>
                <Text style={s.toggle}>
                  {register ? "Déjà un compte ? " : "Pas de compte ? "}
                  <Text style={s.toggleLink}>{register ? "Se connecter" : "Créer un compte"}</Text>
                </Text>
              </Pressable>
            </>
          )}
          {step === 3 && !register && (
            <>
              <TextInput style={[s.input, s.seedInput]} placeholder="Tes 12 mots, séparés par des espaces"
                placeholderTextColor={p.textFaint} autoCapitalize="none" autoCorrect={false}
                autoComplete="off" multiline value={passphrase} onChangeText={setPassphrase} />
              <View style={s.seedMeta}>
                <Text style={[s.seedCount, seedWords.length === 12 && { color: p.accent }]}>
                  {seedWords.length}/12
                </Text>
                {seedUnknown.length > 0 && (
                  <Text style={s.seedUnknown} numberOfLines={1}>
                    Hors liste : {seedUnknown.slice(0, 2).join(", ")}{seedUnknown.length > 2 ? "…" : ""}
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
                <Text style={s.copyTxt}>{copied ? "Copié" : "Copier"}</Text>
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
                  <Text style={s.quizLabel}>Mot {pos + 1}</Text>
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
  illu: { width: 110, height: 110, borderRadius: 55, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 24 },
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
  toggle: { color: p.textDim, fontSize: 13, textAlign: "center", marginTop: 4 },
  toggleLink: { color: p.accent, fontWeight: "600" },
  error: { color: p.danger, fontSize: 13, textAlign: "center", marginTop: 14 },
  foot: { paddingHorizontal: 24, paddingTop: 8 },
  btn: { backgroundColor: p.accent, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
