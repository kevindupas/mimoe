import { StatusBar } from "expo-status-bar";
import { useShareIntent } from "expo-share-intent";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, ToastAndroid, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { postClip } from "./src/api";
import { encrypt } from "./src/crypto";
import Home from "./src/screens/Home";
import Onboarding from "./src/screens/Onboarding";
import Settings from "./src/screens/Settings";
import { clearConfig, getKey, loadConfig, type Config } from "./src/store";
import { colors } from "./src/theme";

type Screen = "loading" | "onboarding" | "home" | "settings";

export default function App() {
  const scheme = useColorScheme();
  const p = scheme === "dark" ? colors.dark : colors.light;
  const [screen, setScreen] = useState<Screen>("loading");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [sharing, setSharing] = useState(false);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  async function refresh() {
    const c = await loadConfig();
    setCfg(c);
    setScreen(c ? "home" : "onboarding");
    return c;
  }

  useEffect(() => { refresh(); }, []);

  // Partage entrant : chiffre + envoie.
  useEffect(() => {
    if (!hasShareIntent) return;
    (async () => {
      const text = shareIntent?.text?.trim();
      const c = cfg ?? (await refresh());
      if (!c || !text) { resetShareIntent(); return; }
      setSharing(true);
      try {
        const key = await getKey();
        if (key) {
          const { ciphertext, nonce } = encrypt(key, text);
          await postClip(c.serverUrl, c.deviceToken, c.deviceId, ciphertext, nonce);
          if (Platform.OS === "android") ToastAndroid.show("Envoyé à Clipd", ToastAndroid.SHORT);
        }
      } catch {
        if (Platform.OS === "android") ToastAndroid.show("Échec de l'envoi", ToastAndroid.SHORT);
      } finally {
        setSharing(false);
        resetShareIntent();
      }
    })();
  }, [hasShareIntent]);

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {screen === "onboarding" && <Onboarding p={p} onDone={refresh} />}
        {screen === "home" && cfg && <Home p={p} cfg={cfg} onSettings={() => setScreen("settings")} />}
        {screen === "settings" && cfg && (
          <Settings p={p} cfg={cfg} onBack={() => setScreen("home")}
            onUnpair={async () => { await clearConfig(); setCfg(null); setScreen("onboarding"); }} />
        )}
        {sharing && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
            <View style={{ backgroundColor: p.surface, padding: 24, borderRadius: 16, alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={p.accent} />
              <Text style={{ color: p.text }}>Envoi…</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}
