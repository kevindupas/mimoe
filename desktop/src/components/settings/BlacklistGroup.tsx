import { useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useBlacklist } from "../../hooks/useBlacklist";
import { tauri, type InstalledApp } from "../../lib/tauri";
import { Icon } from "../ui/Icon";
import { Group, Row } from "./Group";

function AppIcon({ app }: { app: { icon?: string | null } }) {
  if (app.icon) return <img src={app.icon} alt="" className="h-5 w-5 shrink-0 rounded" />;
  return <Icon name="clip" className="h-4 w-4 shrink-0 stroke-[1.75] text-faint" />;
}

export function BlacklistGroup() {
  const { t } = useLanguage();
  const { ids, add, remove, nameOf, iconOf, backfillIcons } = useBlacklist();
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [query, setQuery] = useState("");

  const openPicker = async () => {
    setPicking(true);
    setQuery("");
    if (apps.length === 0) {
      setLoading(true);
      try {
        const list = await tauri.listInstalledApps();
        setApps(list);
        backfillIcons(list); // remplit les icônes des apps déjà blacklistées
      } catch (e) {
        console.error("list_installed_apps", e);
      } finally {
        setLoading(false);
      }
    }
  };

  const pick = (app: InstalledApp) => {
    add(app);
    setPicking(false);
  };

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => !ids.includes(a.bundle_id))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.bundle_id.toLowerCase().includes(q));
  }, [apps, ids, query]);

  return (
    <Group title={t("blacklist")}>
      <div className="px-4 pt-3 text-[11px] leading-[1.5] text-faint">{t("blacklistDesc")}</div>

      {ids.length === 0 && !picking && (
        <Row>
          <span className="text-[12px] text-faint">{t("blacklistEmpty")}</span>
        </Row>
      )}

      {ids.map((id) => (
        <Row key={id}>
          <span className="flex items-center gap-2.5 truncate">
            <AppIcon app={{ icon: iconOf(id) }} />
            <span className="truncate text-[13px] font-medium text-text">{nameOf(id)}</span>
          </span>
          <button
            onClick={() => remove(id)}
            aria-label={t("delete")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition hover:bg-danger hover:text-white cursor-pointer"
          >
            <Icon name="trash" className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </Row>
      ))}

      {picking ? (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2">
            <Icon name="search" className="h-3.5 w-3.5 shrink-0 stroke-[1.75] text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("blacklistSearch")}
              className="flex-1 border-none bg-transparent py-1 text-[13px] text-text placeholder-faint outline-none"
            />
          </div>
          <div className="flex max-h-[240px] flex-col overflow-y-auto scroll-slim border-t border-border">
            {loading ? (
              <div className="px-4 py-4 text-center text-[12px] text-faint">{t("blacklistLoading")}</div>
            ) : available.length === 0 ? (
              <div className="px-4 py-4 text-center text-[12px] text-faint">—</div>
            ) : (
              available.map((app) => (
                <button
                  key={app.bundle_id}
                  onClick={() => pick(app)}
                  className="flex items-center gap-2.5 px-4 py-2 text-left transition hover:bg-surface-hover cursor-pointer"
                >
                  <AppIcon app={app} />
                  <span className="truncate text-[13px] text-text">{app.name}</span>
                  <span className="ml-auto shrink-0 truncate pl-2 font-mono text-[10px] text-faint">
                    {app.bundle_id}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => setPicking(false)}
            className="w-full border-t border-border px-4 py-2.5 text-[12px] font-medium text-dim transition hover:bg-surface-hover cursor-pointer"
          >
            {t("cancel")}
          </button>
        </div>
      ) : (
        <button
          onClick={openPicker}
          className="w-full border-t border-border px-4 py-2.5 text-left text-[13px] font-medium text-accent transition hover:bg-surface-hover cursor-pointer"
        >
          + {t("blacklistAdd")}
        </button>
      )}
    </Group>
  );
}
