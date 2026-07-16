import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { useShareIntent } from "expo-share-intent";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, ToastAndroid, useColorScheme, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { postBlob, postClip, registerPushToken } from "./src/api";
import { base64ToBytes, encrypt, encryptBytes } from "./src/crypto";
import { loadHidden, saveHidden } from "./src/hidden";
import { getFcmToken, loadNotifPref, setupNotifications } from "./src/notify";
import Home from "./src/screens/Home";
import Onboarding from "./src/screens/Onboarding";
import Settings from "./src/screens/Settings";
import { clearConfig, getKey, loadConfig, type Config } from "./src/store";
import { colors, type Palette } from "./src/theme";
import { useClips, type Clip } from "./src/useClips";

export default function App() {
  const scheme = useColorScheme();
  const p = scheme === "dark" ? colors.dark : colors.light;
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const shareGuard = useRef<{ sig: string; at: number }>({ sig: "", at: 0 });

  async function refresh() {
    const c = await loadConfig();
    setCfg(c);
    setReady(true);
    return c;
  }

  useEffect(() => { setupNotifications(); loadNotifPref(); refresh(); }, []);

  // Enregistre le token push FCM des que la config est prete -> le serveur peut
  // reveiller cet appareil meme app tuee. Best-effort : un echec ne casse rien.
  useEffect(() => {
    if (!cfg) return;
    (async () => {
      const fcm = await getFcmToken();
      if (!fcm) return;
      try { await registerPushToken(cfg.serverUrl, cfg.deviceToken, cfg.deviceId, fcm); } catch {}
    })();
  }, [cfg?.deviceId, cfg?.serverUrl]);

  // Partage entrant : texte ou image -> chiffre + envoie.
  useEffect(() => {
    if (!hasShareIntent) return;
    // Garde anti double-envoi : expo-share-intent (Android) livre parfois le MEME
    // intent 2x. On ignore un intent identique reçu dans les 4s -> plus de doublon.
    const sig = JSON.stringify({ t: shareIntent?.text ?? "", f: (shareIntent?.files ?? []).map((x: any) => x.path) });
    const now = Date.now();
    if (sig === shareGuard.current.sig && now - shareGuard.current.at < 4000) {
      resetShareIntent();
      return;
    }
    shareGuard.current = { sig, at: now };
    (async () => {
      const c = cfg ?? (await refresh());
      const key = c ? await getKey() : null;
      if (!c || !key) { resetShareIntent(); return; }
      setSharing(true);
      try {
        const img = (shareIntent?.files ?? []).find((f: any) => f.mimeType?.startsWith("image/"));
        if (img?.path) {
          let uri: string = img.path;
          if (uri.startsWith("content://")) {
            const dest = `${FileSystem.cacheDirectory}share_${Date.now()}.img`;
            await FileSystem.copyAsync({ from: uri, to: dest });
            uri = dest;
          }
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
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
          {!ready ? null : cfg ? (
            <MainApp
              p={p}
              cfg={cfg}
              onUnpair={async () => { await clearConfig(); setCfg(null); }}
            />
          ) : (
            <Onboarding p={p} onDone={refresh} />
          )}
          {sharing && (
            <View style={styles.overlay}>
              <View style={[styles.toast, { backgroundColor: p.surface }]}>
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

function MainApp({ p, cfg, onUnpair }: { p: Palette; cfg: Config; onUnpair: () => void }) {
  const [tab, setTab] = useState<"home" | "settings">("home");
  const { clips, refreshing, refresh, softDelete, togglePin } = useClips(cfg);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<null | (() => void)>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadHidden().then((ids) => setHidden(new Set(ids))); }, []);

  function toggleHide(id: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveHidden([...next]);
      return next;
    });
  }

  function onSwipeDelete(c: Clip) {
    const undoFn = softDelete(c.id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(() => undoFn);
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  }

  function doUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undo?.();
    setUndo(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "home"
          ? <Home p={p} cfg={cfg} clips={clips} refreshing={refreshing} onRefresh={refresh}
              onSwipeDelete={onSwipeDelete} hidden={hidden} onToggleHide={toggleHide} onTogglePin={togglePin} />
          : <Settings p={p} cfg={cfg} onUnpair={onUnpair} />}
      </View>
      <BottomBar p={p} tab={tab} onTab={setTab} />
      {undo && <UndoBar p={p} onUndo={doUndo} />}
    </View>
  );
}

function UndoBar({ p, onUndo }: { p: Palette; onUndo: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.undo, { bottom: insets.bottom + 66, backgroundColor: p.text }]}>
      <Text style={{ color: p.bg, flex: 1, fontSize: 14 }}>Clip supprimé</Text>
      <Pressable onPress={onUndo} hitSlop={10}><Text style={{ color: p.accent, fontWeight: "700", fontSize: 14 }}>ANNULER</Text></Pressable>
    </View>
  );
}

function BottomBar({ p, tab, onTab }: { p: Palette; tab: "home" | "settings"; onTab: (t: "home" | "settings") => void }) {
  const insets = useSafeAreaInsets();
  const items: { key: "home" | "settings"; icon: any; label: string }[] = [
    { key: "home", icon: "time-outline", label: "Historique" },
    { key: "settings", icon: "settings-outline", label: "Réglages" },
  ];
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 6, backgroundColor: p.surface, borderTopColor: p.border }]}>
      {items.map((it) => {
        const active = tab === it.key;
        const color = active ? p.accent : p.textFaint;
        return (
          <Pressable key={it.key} style={styles.tab} onPress={() => onTab(it.key)}>
            <Ionicons name={active ? it.icon.replace("-outline", "") : it.icon} size={23} color={color} />
            <Text style={{ color, fontSize: 11, fontWeight: active ? "600" : "400", marginTop: 2 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  toast: { padding: 24, borderRadius: 16, alignItems: "center", gap: 12 },
  bar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 0 },
  undo: { position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});
