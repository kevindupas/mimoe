import { useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { pop } from "../../lib/sound";
import type { FrontendConfig } from "../../lib/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";
import { Group, Row } from "./Group";
import { BlacklistGroup } from "./BlacklistGroup";
import { useLanguage } from "../../context/LanguageContext";

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

  const onUnpair = async () => {
    if (confirm(t("unpairConfirm"))) await unpair();
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

        <div className="mt-auto pt-2">
          <Button variant="danger" onClick={onUnpair}>
            {t("unpairButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
