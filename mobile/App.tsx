import { StatusBar } from "expo-status-bar";
import { useShareIntent } from "expo-share-intent";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, ToastAndroid, useColorScheme, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { postBlob, postClip } from "./src/api";
import { base64ToBytes, encrypt, encryptBytes } from "./src/crypto";
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
      const c = cfg ?? (await refresh());
      const key = c ? await getKey() : null;
      if (!c || !key) { resetShareIntent(); return; }
      setSharing(true);
      try {
        const img = (shareIntent?.files ?? []).find((f: any) => f.mimeType?.startsWith("image/"));
        if (img?.path) {
          // Image : lit les octets -> chiffre -> blob -> clip kind=image
          const b64 = await FileSystem.readAsStringAsync(img.path, { encoding: "base64" });
          const blob = encryptBytes(key, base64ToBytes(b64));
          const blobId = await postBlob(c.serverUrl, c.deviceToken, blob.ciphertext, blob.nonce);
          const cap = encrypt(key, "Image");
          await postClip(c.serverUrl, c.deviceToken, c.deviceId, cap.ciphertext, cap.nonce, { kind: "image", blobId });
          if (Platform.OS === "android") ToastAndroid.show("Image envoyée", ToastAndroid.SHORT);
        } else {
          const text = shareIntent?.text?.trim();
          if (text) {
            const { ciphertext, nonce } = encrypt(key, text);
            await postClip(c.serverUrl, c.deviceToken, c.deviceId, ciphertext, nonce);
            if (Platform.OS === "android") ToastAndroid.show("Envoyé à Clipd", ToastAndroid.SHORT);
          }
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
      <KeyboardProvider>
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
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
