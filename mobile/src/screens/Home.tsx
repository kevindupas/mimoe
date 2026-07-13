import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, RefreshControl, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getClipImageBase64, getClipImageUri } from "../imageCache";
import type { Config } from "../store";
import type { Palette } from "../theme";
import type { Clip } from "../useClips";

// Image chargée à la demande (quand la card est rendue), depuis le cache disque.
// La liste s'affiche instantanément ; chaque image apparaît quand elle est prête.
function ClipImage({ cfg, clipId, blobId, style, tint }: {
  cfg: Config; clipId: string; blobId: string; style: any; tint: string;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let ok = true;
    getClipImageUri(cfg, clipId, blobId).then((u) => { if (ok) setUri(u); });
    return () => { ok = false; };
  }, [clipId, blobId]);
  if (!uri) return <View style={[style, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={tint} /></View>;
  return <Image source={{ uri }} style={style} resizeMode="contain" />;
}

export default function Home({ p, cfg, clips, refreshing, onRefresh, onDelete }: {
  p: Palette; cfg: Config; clips: Clip[]; refreshing: boolean; onRefresh: () => void; onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = styles(p);

  function confirmDelete(c: Clip) {
    Alert.alert("Supprimer ?", "Ce clip sera retiré de tous tes appareils.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => onDelete(c.id) },
    ]);
  }

  async function copyClip(c: Clip) {
    if (c.kind === "image" && c.blobId) {
      const b64 = await getClipImageBase64(cfg, c.id, c.blobId);
      if (b64) await Clipboard.setImageAsync(b64);
      else { if (Platform.OS === "android") ToastAndroid.show("Image pas encore prête", ToastAndroid.SHORT); return; }
    } else {
      await Clipboard.setStringAsync(c.text);
    }
    if (Platform.OS === "android") ToastAndroid.show("Copié", ToastAndroid.SHORT);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={s.brand}><View style={s.dot} /><Text style={s.brandTxt}>Clipd</Text></View>
      </View>

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ padding: 12, paddingBottom: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={p.accent} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={40} color={p.border} />
            <Text style={s.emptyTitle}>Rien pour l'instant</Text>
            <Text style={s.emptySub}>Partage du texte ou une image → Clipd.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => copyClip(item)} onLongPress={() => confirmDelete(item)} delayLongPress={350}>
            {item.kind === "image" && item.blobId ? (
              <ClipImage cfg={cfg} clipId={item.id} blobId={item.blobId} style={s.cardImg} tint={p.accent} />
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border, backgroundColor: p.surface },
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
