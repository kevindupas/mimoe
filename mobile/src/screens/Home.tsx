import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, FlatList, Image, PanResponder, Platform, Pressable, RefreshControl, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getClipImageBase64, getClipImageUri } from "../imageCache";
import type { Config } from "../store";
import type { Palette } from "../theme";
import type { Clip } from "../useClips";

const SCREEN_W = Dimensions.get("window").width;

// Image chargée à la demande (quand la card est rendue), depuis le cache disque.
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

// Ligne swipe-vers-la-gauche = supprimer. Au-delà du seuil, la card part hors écran.
function SwipeRow({ children, onDelete, danger }: { children: React.ReactNode; onDelete: () => void; danger: string }) {
  const tx = useRef(new Animated.Value(0)).current;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderMove: (_, g) => tx.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -110 || g.vx < -0.6) {
        Animated.timing(tx, { toValue: -SCREEN_W, duration: 180, useNativeDriver: true }).start(() => onDelete());
      } else {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      }
    },
  }), []);
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: danger, borderRadius: 12, alignItems: "flex-end", justifyContent: "center", paddingRight: 22 }]}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

export default function Home({ p, cfg, clips, refreshing, onRefresh, onSwipeDelete, hidden, onToggleHide }: {
  p: Palette; cfg: Config; clips: Clip[]; refreshing: boolean; onRefresh: () => void;
  onSwipeDelete: (c: Clip) => void; hidden: Set<string>; onToggleHide: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = styles(p);

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
        renderItem={({ item }) =>
          hidden.has(item.id) ? (
            // Card masquée : gros oeil au milieu, tap pour révéler.
            <Pressable style={[s.card, s.masked, { marginBottom: 8 }]} onPress={() => onToggleHide(item.id)}>
              <Ionicons name="eye-outline" size={30} color={p.accent} />
              <Text style={s.maskedTxt}>Masqué — appuie pour afficher</Text>
            </Pressable>
          ) : (
            <SwipeRow onDelete={() => onSwipeDelete(item)} danger={p.danger}>
              <Pressable style={s.card} onPress={() => copyClip(item)}>
                <Pressable style={s.eyeBtn} onPress={() => onToggleHide(item.id)} hitSlop={10}>
                  <Ionicons name="eye-off-outline" size={17} color={p.textFaint} />
                </Pressable>
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
            </SwipeRow>
          )
        }
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
  card: { position: "relative", backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14 },
  masked: { alignItems: "center", justifyContent: "center", gap: 8, minHeight: 88, borderStyle: "dashed" },
  maskedTxt: { color: p.textDim, fontSize: 12 },
  eyeBtn: { position: "absolute", top: 8, right: 8, zIndex: 2, padding: 4 },
  cardText: { color: p.text, fontSize: 15, lineHeight: 21, paddingRight: 22 },
  cardImg: { width: "100%", height: 160, borderRadius: 8, backgroundColor: p.surfaceAlt },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  metaTxt: { color: p.textDim, fontSize: 11 },
  badge: { color: p.danger, fontSize: 10, fontWeight: "600", backgroundColor: "rgba(215,0,21,0.10)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: "hidden" },
  time: { color: p.textFaint, fontSize: 11, marginLeft: "auto" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyTitle: { color: p.textDim, fontSize: 15, fontWeight: "500" },
  emptySub: { color: p.textFaint, fontSize: 13, textAlign: "center" },
});
