import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";
import { isNotifEnabled, loadNotifPref, setNotifEnabled } from "../notify";
import type { Config } from "../store";

export default function Settings({ p, cfg, onUnpair }: {
  p: Palette; cfg: Config; onUnpair: () => void;
}) {
  const insets = useSafeAreaInsets();
  const s = styles(p);
  const [notif, setNotif] = useState(isNotifEnabled());
  useEffect(() => { loadNotifPref().then(setNotif); }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Réglages</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <Group p={p} title="Connexion">
          <Row p={p} label="Serveur" value={cfg.serverUrl} />
          <View style={s.divider} />
          <Row p={p} label="Cet appareil" value={cfg.deviceId.slice(0, 8) + "…"} />
        </Group>

        <Group p={p} title="Préférences">
          <View style={s.switchRow}>
            <Text style={s.rowLabel}>Notifications</Text>
            <Switch
              value={notif}
              onValueChange={(v) => { setNotif(v); setNotifEnabled(v); }}
              trackColor={{ true: p.accent, false: p.border }}
              thumbColor="#fff"
            />
          </View>
        </Group>

        <Group p={p} title="Sécurité">
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={16} color={p.textDim} />
            <Text style={s.noteTxt}>Les copies sensibles (mots de passe) sont ignorées. Le serveur ne voit que du chiffré.</Text>
          </View>
        </Group>

        <Pressable style={s.danger} onPress={onUnpair}>
          <Text style={s.dangerTxt}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Group({ p, title, children }: { p: Palette; title: string; children: React.ReactNode }) {
  const s = styles(p);
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.groupTitle}>{title.toUpperCase()}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function Row({ p, label, value }: { p: Palette; label: string; value: string }) {
  const s = styles(p);
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = (p: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: p.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: p.text, fontSize: 17, fontWeight: "600" },
  groupTitle: { color: p.textDim, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, paddingLeft: 4 },
  card: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, gap: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 },
  rowLabel: { color: p.text, fontSize: 15 },
  rowValue: { color: p.textDim, fontSize: 13, flexShrink: 1 },
  divider: { height: 1, backgroundColor: p.border },
  note: { flexDirection: "row", gap: 8, padding: 14, alignItems: "flex-start" },
  noteTxt: { color: p.textDim, fontSize: 13, flex: 1, lineHeight: 19 },
  danger: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
  dangerTxt: { color: p.danger, fontSize: 15, fontWeight: "600" },
});
