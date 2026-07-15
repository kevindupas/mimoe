import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, FlatList, PanResponder, Platform, Pressable, RefreshControl, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { getClipFileUri, getClipImageBase64, getClipImageUri } from "../imageCache";
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
  // expo-image : anime nativement GIF/WebP (contrairement au <Image> RN sur Android).
  return <Image source={uri} style={style} contentFit="contain" />;
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

// Motif génératif animé (formes qui morphent) pour une card masquée.
const MORPH_BAG = [0, 1, 2, 3, 4, 5, 5, 5, 5, 5, 6, 6, 6]; // poids : vide/faible dominent
const pickShape = () => MORPH_BAG[Math.floor(Math.random() * MORPH_BAG.length)];

function CellShape({ idx, color }: { idx: number; color: string }) {
  switch (idx) {
    case 0: return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
    case 1: return <View style={{ gap: 3 }}>{[0, 1, 2].map((i) => <View key={i} style={{ width: 12, height: 1.6, backgroundColor: color }} />)}</View>;
    case 2: return (
      <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: 18, height: 1.6, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
        <View style={{ position: "absolute", width: 18, height: 1.6, backgroundColor: color, transform: [{ rotate: "-45deg" }] }} />
      </View>
    );
    case 3: return <View style={{ width: 11, height: 11, borderWidth: 1.6, borderColor: color }} />;
    case 4: return <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}><View style={{ width: 18, height: 1.6, backgroundColor: color, transform: [{ rotate: "-45deg" }] }} /></View>;
    case 6: return <View style={{ width: 15, height: 15, backgroundColor: "rgba(128,128,128,0.12)" }} />;
    default: return null;
  }
}

function MorphCell({ color }: { color: string }) {
  const [idx, setIdx] = useState(pickShape);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(() => { setIdx(pickShape()); loop(); }, 1000 + Math.random() * 4000); };
    loop();
    return () => clearTimeout(t);
  }, []);
  return <View style={morphStyles.cell}><CellShape idx={idx} color={color} /></View>;
}

const MORPH_CELLS = Array.from({ length: 90 });
function MorphField({ color }: { color: string }) {
  return (
    <View style={morphStyles.wrap} pointerEvents="none">
      {MORPH_CELLS.map((_, i) => <MorphCell key={i} color={color} />)}
    </View>
  );
}
const morphStyles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", flexWrap: "wrap", overflow: "hidden", opacity: 0.55, padding: 4 },
  cell: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
});

export default function Home({ p, cfg, clips, refreshing, onRefresh, onSwipeDelete, hidden, onToggleHide }: {
  p: Palette; cfg: Config; clips: Clip[]; refreshing: boolean; onRefresh: () => void;
  onSwipeDelete: (c: Clip) => void; hidden: Set<string>; onToggleHide: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = styles(p);

  async function copyClip(c: Clip) {
    // Fichier : pas de "presse-papier fichier" sur mobile → on ouvre le partage/enregistrement.
    if (c.kind === "file" && c.blobId) {
      const uri = await getClipFileUri(cfg, c.id, c.blobId, c.text);
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, c.mime ? { mimeType: c.mime } : undefined);
      } else if (Platform.OS === "android") {
        ToastAndroid.show("Fichier pas encore prêt", ToastAndroid.SHORT);
      }
      return;
    }
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
            // Card masquée : champ de points floutés + oeil au centre, tap pour révéler.
            <Pressable style={[s.card, s.masked, { marginBottom: 8 }]} onPress={() => onToggleHide(item.id)}>
              <MorphField color={p.textDim} />
              <View style={s.revealBadge}><Ionicons name="eye-outline" size={22} color="#fff" /></View>
            </Pressable>
          ) : (
            <SwipeRow onDelete={() => onSwipeDelete(item)} danger={p.danger}>
              <Pressable style={s.card} onPress={() => copyClip(item)}>
                <Pressable style={s.eyeBtn} onPress={() => onToggleHide(item.id)} hitSlop={10}>
                  <Ionicons name="eye-off-outline" size={17} color={p.textFaint} />
                </Pressable>
                {item.kind === "image" && item.blobId ? (
                  <>
                    <ClipImage cfg={cfg} clipId={item.id} blobId={item.blobId} style={s.cardImg} tint={p.accent} />
                    {!!item.text && <Text style={s.imgName} numberOfLines={1}>{item.text}</Text>}
                  </>
                ) : item.kind === "file" ? (
                  <View style={s.fileRow}>
                    <View style={s.fileIcon}>
                      <Ionicons name="document-outline" size={22} color={p.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.fileName} numberOfLines={1}>{item.text}</Text>
                      <Text style={s.fileHint}>Toucher pour partager</Text>
                    </View>
                  </View>
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
  masked: { alignItems: "center", justifyContent: "center", minHeight: 88, overflow: "hidden", backgroundColor: p.surfaceAlt },
  revealBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: p.accent, alignItems: "center", justifyContent: "center", zIndex: 1, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  eyeBtn: { position: "absolute", top: 8, right: 8, zIndex: 2, padding: 4 },
  cardText: { color: p.text, fontSize: 15, lineHeight: 21, paddingRight: 22 },
  cardImg: { width: "100%", height: 160, borderRadius: 8, backgroundColor: p.surfaceAlt },
  imgName: { color: p.textDim, fontSize: 12, fontWeight: "500", marginTop: 6 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 22 },
  fileIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: p.surfaceAlt, alignItems: "center", justifyContent: "center" },
  fileName: { color: p.text, fontSize: 14, fontWeight: "600" },
  fileHint: { color: p.textFaint, fontSize: 11, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  metaTxt: { color: p.textDim, fontSize: 11 },
  badge: { color: p.danger, fontSize: 10, fontWeight: "600", backgroundColor: "rgba(215,0,21,0.10)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: "hidden" },
  time: { color: p.textFaint, fontSize: 11, marginLeft: "auto" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyTitle: { color: p.textDim, fontSize: 15, fontWeight: "500" },
  emptySub: { color: p.textFaint, fontSize: 13, textAlign: "center" },
});
