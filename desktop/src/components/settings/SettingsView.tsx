import { useEffect, useState } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useApp } from "../../context/AppContext";
import { deleteAccount, fetchMe } from "../../lib/api";
import { tauri } from "../../lib/tauri";
import { pop } from "../../lib/sound";
import type { FrontendConfig } from "../../lib/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";
import { Group, Row } from "./Group";
import { BlacklistGroup } from "./BlacklistGroup";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";

/**
 * In-app confirmation. The webview's native `window.confirm()` is a no-op in
 * the Tauri WKWebView (it returns false), so destructive actions gated on it
 * silently never ran. This styled modal replaces it and actually works.
 */
function ConfirmModal({
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[300px] rounded-xl border border-border bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] leading-[1.5] text-text">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteRow({ icon, children }: { icon: "shield" | "clip"; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 text-[12px] leading-[1.5] text-dim">
      <Icon name={icon} className="mt-0.5 shrink-0 text-faint h-3.5 w-3.5 stroke-[1.75]" />
      <span>{children}</span>
    </div>
  );
}

export function SettingsView({ config }: { config: FrontendConfig }) {
  const { soundOn, setSoundOn, goTo, unpair } = useApp();
  const { t, languageSetting, setLanguageSetting } = useLanguage();
  const { themeSetting, setThemeSetting } = useTheme();
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [email, setEmail] = useState(config.email);
  const [confirmKind, setConfirmKind] = useState<null | "unpair" | "delete">(null);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    isEnabled().then(setAutoLaunch).catch(() => {});
  }, []);

  // Installs paired before the email was stored: fetch it once from /api/me
  // and persist it locally so it shows here and survives restarts.
  useEffect(() => {
    if (email) return;
    fetchMe(config).then((e) => {
      if (e) {
        setEmail(e);
        tauri.updateEmail(e).catch(() => {});
      }
    });
  }, [email, config]);

  const onToggleAutoLaunch = async (on: boolean) => {
    setAutoLaunch(on);
    try {
      await (on ? enable() : disable());
    } catch (e) {
      console.error("autostart", e);
      setAutoLaunch(!on);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goTo("history");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goTo]);

  const onToggleSound = (on: boolean) => {
    setSoundOn(on);
    if (on) pop();
  };

  const doUnpair = async () => {
    setConfirmKind(null);
    await unpair();
  };

  const doDeleteAccount = async () => {
    setConfirmKind(null);
    try {
      await deleteAccount(config);
    } catch (e) {
      console.error("delete account", e);
      setDeleteError(true);
      return;
    }
    // Local purge + back to onboarding.
    await unpair();
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-[11px] select-none shrink-0">
        <Button
          variant="ghost"
          onClick={() => goTo("history")}
          title={t("back")}
          aria-label={t("back")}
          className="shrink-0"
        >
          <Icon name="back" className="h-[15px] w-[15px] stroke-[1.75]" />
        </Button>
        <div className="text-[14px] font-semibold text-text">{t("settingsLabel")}</div>
      </header>

      <div className="flex-1 flex flex-col justify-between overflow-y-auto p-4 gap-6 scroll-slim">
        <div className="flex flex-col gap-4">
          <Group title={t("connexion")}>
            <Row>
              <span className="font-medium text-text">{t("account")}</span>
              <span className="font-mono text-[11.5px] text-dim select-text">{email || "—"}</span>
            </Row>
            <Row>
              <span className="font-medium text-text">{t("server")}</span>
              <span className="font-mono text-[11.5px] text-dim select-text">{config.server_url}</span>
            </Row>
            <Row>
              <span className="font-medium text-text">{t("device")}</span>
              <span className="font-mono text-[11.5px] text-dim select-text">{config.device_id.slice(0, 8)}…</span>
            </Row>
          </Group>

          <Group title={t("preferences")}>
            <Row>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text">{t("soundOnArrival")}</span>
                <span className="text-[11px] text-faint">{t("soundDesc")}</span>
              </div>
              <Switch checked={soundOn} onChange={onToggleSound} />
            </Row>
            <Row>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text">{t("language")}</span>
              </div>
              <select
                value={languageSetting}
                onChange={(e) => setLanguageSetting(e.target.value as any)}
                className="rounded-md border border-border-strong bg-surface text-text text-[12px] font-medium px-2.5 py-1 outline-none transition-colors duration-150 hover:bg-surface-hover cursor-pointer"
              >
                <option value="system">{t("langSystem")}</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="pt">Português</option>
              </select>
            </Row>
            <Row>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text">{t("theme")}</span>
              </div>
              <select
                value={themeSetting}
                onChange={(e) => setThemeSetting(e.target.value as any)}
                className="rounded-md border border-border-strong bg-surface text-text text-[12px] font-medium px-2.5 py-1 outline-none transition-colors duration-150 hover:bg-surface-hover cursor-pointer"
              >
                <option value="system">{t("themeSystem")}</option>
                <option value="light">{t("themeLight")}</option>
                <option value="dark">{t("themeDark")}</option>
              </select>
            </Row>
            <Row>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text">{t("launchAtLogin")}</span>
                <span className="text-[11px] text-faint">{t("launchAtLoginDesc")}</span>
              </div>
              <Switch checked={autoLaunch} onChange={onToggleAutoLaunch} />
            </Row>
          </Group>

          <Group title={t("security")}>
            <NoteRow icon="shield">
              {t("securityDesc1")}
            </NoteRow>
            <NoteRow icon="clip">
              {t("securityDesc2")}
            </NoteRow>
          </Group>

          <BlacklistGroup />
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button variant="danger" onClick={() => setConfirmKind("unpair")}>
            {t("unpairButton")}
          </Button>
          <button
            onClick={() => setConfirmKind("delete")}
            className="self-center py-1 text-[12px] text-faint transition-colors hover:text-danger"
          >
            {t("deleteAccountButton")}
          </button>
        </div>
      </div>

      {confirmKind === "unpair" && (
        <ConfirmModal
          message={t("unpairConfirm")}
          confirmLabel={t("unpairButton")}
          danger
          onConfirm={doUnpair}
          onCancel={() => setConfirmKind(null)}
        />
      )}
      {confirmKind === "delete" && (
        <ConfirmModal
          message={t("deleteAccountConfirm")}
          confirmLabel={t("deleteAccountButton")}
          danger
          onConfirm={doDeleteAccount}
          onCancel={() => setConfirmKind(null)}
        />
      )}
      {deleteError && (
        <ConfirmModal
          message={t("deleteAccountError")}
          confirmLabel={t("confirm")}
          onConfirm={() => setDeleteError(false)}
          onCancel={() => setDeleteError(false)}
        />
      )}
    </div>
  );
}
