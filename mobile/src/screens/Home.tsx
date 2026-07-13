import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, ToastAndroid, Platform, View, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";
import { fetchBlob, fetchHistory, type RawClip } from "../api";
import { bytesToBase64, decrypt, decryptBytes } from "../crypto";
import { connect } from "../realtime";
import { getKey, type Config } from "../store";

interface Clip { id: string; kind: "text" | "image"; text: string; imageB64?: string; origin: string; sensitive: boolean; createdAt: string; mine: boolean; }

export default function Home({ p, cfg, onSettings }: { p: Palette; cfg: Config; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const [clips, setClips] = useState<Clip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const keyRef = useRef<Uint8Array | null>(null);
  const s = styles(p);

  async function toClip(r: RawClip, key: Uint8Array): Promise<Clip | null> {
    try {
      const text = decrypt(key, r.ciphertext, r.nonce);
      let imageB64: string | undefined;
      const isImage = r.kind === "image" && !!r.blob_id;
      if (isImage) {
        const blob = await fetchBlob(cfg.serverUrl, cfg.deviceToken, r.blob_id!);
        imageB64 = bytesToBase64(decryptBytes(key, blob.data, blob.nonce));
      }
      return {
        id: r.id, kind: isImage ? "image" : "text", text, imageB64,
        origin: r.origin_device_id, sensitive: r.is_sensitive,
        createdAt: r.created_at, mine: r.origin_device_id === cfg.deviceId,
      };
    } catch { return null; }
  }

  async function load() {
    const key = keyRef.current ?? (await getKey());
    keyRef.current = key;
    if (!key) return;
    const raws = await fetchHistory(cfg.serverUrl, cfg.deviceToken);
    const list: Clip[] = [];
    for (const r of raws) { const c = await toClip(r, key); if (c) list.push(c); }
    setClips(list);
  }

  useEffect(() => {
    load();
    const pusher = connect(cfg, async (raw: RawClip) => {
      const key = keyRef.current ?? (await getKey());
      keyRef.current = key;
      if (!key) return;
      const clip = await toClip(raw, key);
      if (clip) setClips((cur) => (cur.some((c) => c.id === clip.id) ? cur : [clip, ...cur]));
    });
    return () => pusher.disconnect();
  }, []);

  async function copyClip(c: Clip) {
    if (c.kind === "image" && c.imageB64) await Clipboard.setImageAsync(c.imageB64);
    else await Clipboard.setStringAsync(c.text);
    if (Platform.OS === "android") ToastAndroid.show("Copié", ToastAndroid.SHORT);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={s.brand}><View style={s.dot} /><Text style={s.brandTxt}>Clipd</Text></View>
        <Pressable onPress={onSettings} hitSlop={10}><Ionicons name="settings-outline" size={22} color={p.textDim} /></Pressable>
      </View>

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={p.accent}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={40} color={p.border} />
            <Text style={s.emptyTitle}>Rien pour l'instant</Text>
            <Text style={s.emptySub}>Partage du texte → Clipd, ou copie sur un autre appareil.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => copyClip(item)}>
            {item.kind === "image" && item.imageB64 ? (
              <Image source={{ uri: `data:image/png;base64,${item.imageB64}` }} style={s.cardImg} resizeMode="contain" />
            ) : (
              <Text style={s.cardText} numberOfLines={4}>{item.text}</Text>
            )}
            <View style={s.meta}>
              <Ionicons name={item.mine ? "phone-portrait-outline" : "laptop-outline"} size={13} color={p.textDim} />
              <Text style={s.metaTxt}>{item.mine ? "ce téléphone" : "reçu"}</Text>
              {item.sensitive && <Text style={s.badge}>SENSIBLE</Text>}
              <Text style={s.time}>{rel(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function rel(iso: string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "à l'instant";
  if (d < 3600) return `${Math.floor(d / 60)} min`;
  if (d < 86400) return `${Math.floor(d / 3600)} h`;
  return `${Math.floor(d / 86400)} j`;
}

const styles = (p: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: p.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border, backgroundColor: p.surface },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: p.accent },
  brandTxt: { color: p.text, fontWeight: "600", fontSize: 15 },
  card: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardText: { color: p.text, fontSize: 15, lineHeight: 21 },
  cardImg: { width: "100%", height: 160, borderRadius: 8, backgroundColor: p.surfaceAlt },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  metaTxt: { color: p.textDim, fontSize: 11 },
  badge: { color: p.danger, fontSize: 10, fontWeight: "600", backgroundColor: "rgba(215,0,21,0.10)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: "hidden" },
  time: { color: p.textFaint, fontSize: 11, marginLeft: "auto" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyTitle: { color: p.textDim, fontSize: 15, fontWeight: "500" },
  emptySub: { color: p.textFaint, fontSize: 13, textAlign: "center" },
});
