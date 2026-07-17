import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, FlatList, PanResponder, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { useLanguage, type TKey } from "../i18n";
import { getClipFileUri, getClipImageBase64, getClipImageUri } from "../imageCache";
import type { Config } from "../store";
import type { Palette } from "../theme";
import type { Clip } from "../useClips";

const SCREEN_W = Dimensions.get("window").width;

/** Largeur du tiroir d'actions révélé au swipe droite (favori + cacher). */
const ACTIONS_W = 132;
/** Au-delà, on considère le geste comme intentionnel plutôt qu'un frôlement. */
const OPEN_THRESHOLD = ACTIONS_W * 0.5;
/** Swipe gauche complet : la card part et le clip est supprimé. */
const DELETE_THRESHOLD = 110;

export type Filter = "all" | "text" | "image" | "file" | "pinned";

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

/**
 * Ligne swipable dans les deux sens.
 *
 * Gauche = supprimer : geste destructif isolé de son côté, pour qu'un pouce
 * pressé ne l'atteigne jamais en visant un favori. Passé le seuil, la card part
 * hors écran (l'annulation reste possible via la barre d'undo).
 *
 * Droite = tiroir favori + cacher : révélé et maintenu ouvert plutôt que
 * déclenché au relâchement, pour que l'action soit lue avant d'être touchée.
 */
function SwipeRow({ children, onDelete, onPin, onHide, pinned, danger, p, t }: {
  children: React.ReactNode;
  onDelete: () => void;
  onPin: () => void;
  onHide: () => void;
  pinned: boolean;
  danger: string;
  p: Palette;
  t: (k: TKey) => string;
}) {
  const tx = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const s = styles(p);

  const close = () => {
    open.current = false;
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  };

  const pan = useMemo(() => PanResponder.create({
    // Le seuil horizontal (1.4x le vertical) protège le scroll de la liste :
    // un geste majoritairement vertical ne prend jamais le responder.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderMove: (_, g) => {
      const base = open.current ? ACTIONS_W : 0;
      tx.setValue(Math.max(-SCREEN_W, Math.min(ACTIONS_W, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const base = open.current ? ACTIONS_W : 0;
      const x = base + g.dx;
      if (x < -DELETE_THRESHOLD || g.vx < -0.6) {
        open.current = false;
        Animated.timing(tx, { toValue: -SCREEN_W, duration: 180, useNativeDriver: true }).start(() => onDelete());
      } else if (x > OPEN_THRESHOLD) {
        open.current = true;
        Animated.spring(tx, { toValue: ACTIONS_W, useNativeDriver: true, bounciness: 6 }).start();
      } else {
        close();
      }
    },
  }), []);

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Fond gauche : supprimer. Révélé quand la card glisse vers la gauche. */}
      <View style={[StyleSheet.absoluteFill, s.deleteBg, { backgroundColor: danger }]}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </View>

      {/* Tiroir d'actions, borné à sa largeur et opaque : en absoluteFill il
          laissait le rouge de suppression transparaître sous accentSoft. */}
      <View style={s.actionsBg}>
        <Pressable
          style={[s.action, { backgroundColor: p.accentSoft }]}
          onPress={() => { close(); onPin(); }}
        >
          <Ionicons name={pinned ? "pin" : "pin-outline"} size={19} color={p.accent} />
          <Text style={[s.actionTxt, { color: p.accent }]} numberOfLines={1}>
            {pinned ? t("actionUnpin") : t("actionPin")}
          </Text>
        </Pressable>
        <Pressable
          style={[s.action, { backgroundColor: p.surfaceAlt }]}
          onPress={() => { close(); onHide(); }}
        >
          <Ionicons name="eye-off-outline" size={19} color={p.textDim} />
          <Text style={[s.actionTxt, { color: p.textDim }]} numberOfLines={1}>{t("actionHide")}</Text>
        </Pressable>
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

export default function Home({ p, cfg, clips, refreshing, onRefresh, onSwipeDelete, hidden, onToggleHide, onTogglePin }: {
  p: Palette; cfg: Config; clips: Clip[]; refreshing: boolean; onRefresh: () => void;
  onSwipeDelete: (c: Clip) => void; hidden: Set<string>; onToggleHide: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const s = styles(p);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clips.filter((c) => {
      if (filter === "pinned" && !c.pinned) return false;
      if (filter !== "all" && filter !== "pinned" && c.kind !== filter) return false;
      // Une card masquée reste filtrable par type mais jamais par son contenu :
      // la faire remonter sur un mot-clé annulerait le masquage.
      if (q && (hidden.has(c.id) || !c.text?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [clips, query, filter, hidden]);

  const FILTERS: { key: Filter; label: TKey }[] = [
    { key: "all", label: "filterAll" },
    { key: "pinned", label: "filterPinned" },
    { key: "text", label: "filterText" },
    { key: "image", label: "filterImage" },
    { key: "file", label: "filterFile" },
  ];

  async function copyClip(c: Clip) {
    // Fichier : pas de "presse-papier fichier" sur mobile → on ouvre le partage/enregistrement.
    if (c.kind === "file" && c.blobId) {
      const uri = await getClipFileUri(cfg, c.id, c.blobId, c.text);
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, c.mime ? { mimeType: c.mime } : undefined);
      } else if (Platform.OS === "android") {
        ToastAndroid.show(t("fileNotReady"), ToastAndroid.SHORT);
      }
      return;
    }
    if (c.kind === "image" && c.blobId) {
      const b64 = await getClipImageBase64(cfg, c.id, c.blobId);
      if (b64) await Clipboard.setImageAsync(b64);
      else { if (Platform.OS === "android") ToastAndroid.show(t("imageNotReady"), ToastAndroid.SHORT); return; }
    } else {
      await Clipboard.setStringAsync(c.text);
    }
    if (Platform.OS === "android") ToastAndroid.show(t("copied"), ToastAndroid.SHORT);
  }

  const searching = query.trim().length > 0 || filter !== "all";

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={s.brand}><View style={s.dot} /><Text style={s.brandTxt}>Mimoe</Text></View>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={p.textFaint} />
        <TextInput
          style={s.searchInput}
          placeholder={t("searchPlaceholder")}
          placeholderTextColor={p.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={p.textFaint} />
          </Pressable>
        )}
      </View>

      <View style={s.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[s.chip, active && { backgroundColor: p.accent, borderColor: p.accent }]}
            >
              <Text style={[s.chipTxt, active && { color: "#fff", fontWeight: "600" }]}>{t(f.label)}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, paddingBottom: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={p.accent} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name={searching ? "search-outline" : "clipboard-outline"} size={40} color={p.border} />
            <Text style={s.emptyTitle}>{searching ? t("emptySearchTitle") : t("emptyTitle")}</Text>
            <Text style={s.emptySub}>{searching ? t("emptySearchSub") : t("emptySub")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          // Masquée ou non, la card reste swipable : sans ça un clip caché ne
          // pouvait plus être ni supprimé ni mis en favori.
          <SwipeRow
            onDelete={() => onSwipeDelete(item)}
            onPin={() => onTogglePin(item.id)}
            onHide={() => onToggleHide(item.id)}
            pinned={!!item.pinned}
            danger={p.danger}
            p={p}
            t={t}
          >
            {hidden.has(item.id) ? (
              // Card masquée : champ de formes qui morphent + oeil au centre, tap pour révéler.
              <Pressable style={[s.card, s.masked]} onPress={() => onToggleHide(item.id)}>
                <MorphField color={p.textDim} />
                <View style={s.revealBadge}><Ionicons name="eye-outline" size={22} color="#fff" /></View>
              </Pressable>
            ) : (
              <Pressable style={s.card} onPress={() => copyClip(item)}>
                {item.pinned && (
                  <View style={s.pinMark}>
                    <Ionicons name="pin" size={13} color={p.accent} />
                  </View>
                )}
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
                      <Text style={s.fileHint}>{t("tapToShare")}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={s.cardText} numberOfLines={4}>{item.text}</Text>
                )}
                <View style={s.meta}>
                  <Ionicons name={item.mine ? "phone-portrait-outline" : "laptop-outline"} size={13} color={p.textDim} />
                  <Text style={s.metaTxt}>{item.mine ? t("thisPhone") : t("received")}</Text>
                  {item.sensitive && <Text style={s.badge}>{t("sensitive")}</Text>}
                  <Text style={s.time}>{rel(item.createdAt, t)}</Text>
                </View>
              </Pressable>
            )}
          </SwipeRow>
        )}
      />
    </View>
  );
}

function rel(iso: string, t: (k: TKey) => string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return t("justNow");
  if (d < 3600) return `${Math.floor(d / 60)} ${t("minutesShort")}`;
  if (d < 86400) return `${Math.floor(d / 3600)} ${t("hoursShort")}`;
  return `${Math.floor(d / 86400)} ${t("daysShort")}`;
}

const styles = (p: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: p.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border, backgroundColor: p.surface },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: p.accent },
  brandTxt: { color: p.text, fontWeight: "600", fontSize: 15 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, height: 38, borderRadius: 10, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border },
  searchInput: { flex: 1, color: p.text, fontSize: 14, padding: 0 },
  chips: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface },
  chipTxt: { color: p.textDim, fontSize: 12 },
  card: { position: "relative", backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14 },
  masked: { alignItems: "center", justifyContent: "center", minHeight: 88, overflow: "hidden", backgroundColor: p.surfaceAlt },
  revealBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: p.accent, alignItems: "center", justifyContent: "center", zIndex: 1, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  pinMark: { position: "absolute", top: 8, right: 8, zIndex: 2 },
  deleteBg: { borderRadius: 12, alignItems: "flex-end", justifyContent: "center", paddingRight: 22 },
  // Déborde de 16px sous la card : sans ça, ses coins arrondis laissent voir le
  // rouge de suppression au ras du tiroir. Coins droits carrés pour la même raison.
  actionsBg: { position: "absolute", left: 0, top: 0, bottom: 0, width: ACTIONS_W + 16, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, flexDirection: "row", alignItems: "stretch", overflow: "hidden", backgroundColor: p.bg },
  action: { width: ACTIONS_W / 2, alignItems: "center", justifyContent: "center", gap: 3 },
  actionTxt: { fontSize: 10.5, fontWeight: "500" },
  cardText: { color: p.text, fontSize: 15, lineHeight: 21, paddingRight: 24 },
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
