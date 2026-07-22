import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteAccount, fetchMe } from "../api";
import { useLanguage, type LangSetting } from "../i18n";
import { isNotifEnabled, loadNotifPref, setNotifEnabled } from "../notify";
import { saveEmail, type Config } from "../store";
import { useTheme, type Palette, type ThemeSetting } from "../theme";

/** Language labels: never translated — we read them in their own language. */
const LANGS: { key: LangSetting; label: string }[] = [
  { key: "system", label: "" }, // filled via t("langSystem")
  { key: "fr", label: "Français" },
  { key: "en", label: "English" },
  { key: "es", label: "Español" },
  { key: "pt", label: "Português" },
];

export default function Settings({ p, cfg, onUnpair }: {
  p: Palette; cfg: Config; onUnpair: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, languageSetting, setLanguageSetting } = useLanguage();
  const { themeSetting, setThemeSetting } = useTheme();
  const s = styles(p);
  const [notif, setNotif] = useState(isNotifEnabled());
  useEffect(() => { loadNotifPref().then(setNotif); }, []);

  // Account email: shown from local config; if paired before it was stored,
  // fetch it once from /api/me and persist it.
  const [email, setEmail] = useState(cfg.email);
  useEffect(() => {
    if (email) return;
    fetchMe(cfg.serverUrl, cfg.deviceToken).then((e) => {
      if (e) { setEmail(e); saveEmail(e); }
    });
  }, [email, cfg.serverUrl, cfg.deviceToken]);

  // Account deletion: irreversible and global (all devices).
  // Destructive confirmation before the server call, then local sign-out.
  function onDeleteAccount() {
    Alert.alert(t("deleteAccountButton"), t("deleteAccountConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteAccountButton"),
        style: "destructive",
        onPress: async () => {
          const ok = await deleteAccount(cfg.serverUrl, cfg.deviceToken);
          if (!ok) {
            ToastAndroid.show(t("deleteAccountError"), ToastAndroid.SHORT);
            return;
          }
          onUnpair();
        },
      },
    ]);
  }

  const themes: { key: ThemeSetting; label: string }[] = [
    { key: "system", label: t("themeSystem") },
    { key: "light", label: t("themeLight") },
    { key: "dark", label: t("themeDark") },
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>{t("settingsTitle")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <Group p={p} title={t("groupConnection")}>
          <Row p={p} label={t("rowAccount")} value={email || "—"} />
          <View style={s.divider} />
          <Row p={p} label={t("rowServer")} value={cfg.serverUrl} />
          <View style={s.divider} />
          <Row p={p} label={t("rowDevice")} value={cfg.deviceId.slice(0, 8) + "…"} />
        </Group>

        <Group p={p} title={t("groupPreferences")}>
          <View style={s.switchRow}>
            <Text style={s.rowLabel}>{t("rowNotifications")}</Text>
            <Switch
              value={notif}
              onValueChange={(v) => { setNotif(v); setNotifEnabled(v); }}
              trackColor={{ true: p.accent, false: p.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={s.divider} />
          <Segmented
            p={p}
            label={t("rowLanguage")}
            options={LANGS.map((l) => ({ key: l.key, label: l.key === "system" ? t("langSystem") : l.label }))}
            value={languageSetting}
            onChange={setLanguageSetting}
          />
          <View style={s.divider} />
          <Segmented
            p={p}
            label={t("rowTheme")}
            options={themes}
            value={themeSetting}
            onChange={setThemeSetting}
          />
        </Group>

        <Group p={p} title={t("groupSecurity")}>
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={16} color={p.textDim} />
            <Text style={s.noteTxt}>{t("securityNote")}</Text>
          </View>
        </Group>

        <Pressable style={s.danger} onPress={onUnpair}>
          <Text style={s.dangerTxt}>{t("signOut")}</Text>
        </Pressable>

        <Pressable style={s.deleteRow} onPress={onDeleteAccount}>
          <Text style={s.deleteTxt}>{t("deleteAccountButton")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Choice among a few options. The labels wrap: 5 languages don't fit on one line. */
function Segmented<T extends string>({ p, label, options, value, onChange }: {
  p: Palette;
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const s = styles(p);
  return (
    <View style={s.segWrap}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.segRow}>
        {options.map((o) => {
          const active = value === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              style={[s.seg, active && { backgroundColor: p.accent, borderColor: p.accent }]}
            >
              <Text style={[s.segTxt, active && { color: "#fff", fontWeight: "600" }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
  segWrap: { padding: 14, gap: 9 },
  segRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  seg: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.bg },
  segTxt: { color: p.textDim, fontSize: 12.5 },
  note: { flexDirection: "row", gap: 8, padding: 14, alignItems: "flex-start" },
  noteTxt: { color: p.textDim, fontSize: 13, flex: 1, lineHeight: 19 },
  danger: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
  dangerTxt: { color: p.danger, fontSize: 15, fontWeight: "600" },
  deleteRow: { alignItems: "center", paddingVertical: 12, marginTop: 2 },
  deleteTxt: { color: p.textFaint, fontSize: 13 },
});
