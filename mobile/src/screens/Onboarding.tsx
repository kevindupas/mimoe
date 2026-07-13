import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";
import { auth, newDeviceId } from "../api";
import { deriveKey } from "../crypto";
import { saveConfig } from "../store";

const ICONS: any = ["phone-portrait-outline", "cloud-outline", "person-outline", "lock-closed-outline"];

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

  const s = styles(p);

  const titles = ["Ton presse-papier, partout.", "Ton serveur", register ? "Crée ton compte" : "Connecte-toi", "La clé secrète"];
  const subs = [
    "Copie sur ton téléphone, colle sur ton ordi. Chiffré de bout en bout, sur ton propre serveur.",
    "L'adresse de ton instance Clipd. Il ne voit jamais tes données en clair.",
    "Ton compte relie tous tes appareils. Historique isolé, rien que le tien.",
    "Une passphrase tapée sur chacun de tes appareils. Elle chiffre tout et ne quitte jamais ce téléphone.",
  ];

  async function finish() {
    setBusy(true); setError("");
    try {
      const url = server.trim().replace(/\/+$/, "");
      const deviceId = newDeviceId();
      const res = await auth(url, register ? "register" : "login", email.trim(), password, deviceId);
      const key = await deriveKey(passphrase);
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

  function next() {
    setError("");
    if (step === 1 && !server.trim()) return setError("Renseigne le serveur.");
    if (step === 2 && (!email.trim() || !password)) return setError("Email et mot de passe requis.");
    if (step === 3) { if (!passphrase) return setError("La passphrase est requise."); return finish(); }
    setStep(step + 1);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        {step > 0 ? (
          <Pressable onPress={() => { setError(""); setStep(step - 1); }} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={p.text} />
          </Pressable>
        ) : (
          <View style={s.brand}><View style={s.dot} /><Text style={s.brandTxt}>Clipd</Text></View>
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
        <View style={s.illu}><Ionicons name={ICONS[step]} size={48} color={p.accent} /></View>
        <Text style={s.title}>{titles[step]}</Text>
        <Text style={s.sub}>{subs[step]}</Text>

        <View style={s.fields}>
          {step === 1 && (
            <TextInput style={s.input} placeholder="https://clipd.exemple.com" placeholderTextColor={p.textFaint}
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
          {step === 3 && (
            <TextInput style={s.input} placeholder="Passphrase partagée" placeholderTextColor={p.textFaint}
              secureTextEntry value={passphrase} onChangeText={setPassphrase} />
          )}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      <View style={[s.foot, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={next}>
          {busy ? <ActivityIndicator color="#fff" /> :
            <Text style={s.btnTxt}>{step === 0 ? "Commencer" : step === 3 ? "Terminer" : "Continuer"}</Text>}
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
  toggle: { color: p.textDim, fontSize: 13, textAlign: "center", marginTop: 4 },
  toggleLink: { color: p.accent, fontWeight: "600" },
  error: { color: p.danger, fontSize: 13, textAlign: "center", marginTop: 14 },
  foot: { paddingHorizontal: 24, paddingTop: 8 },
  btn: { backgroundColor: p.accent, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
