import { useCallback, useEffect, useState } from "react";
import { tauri } from "../lib/tauri";

interface AppRef {
  name: string;
  bundle_id: string;
  icon?: string | null;
}

const NAMES_KEY = "clipd_blacklist_names";
const ICONS_KEY = "clipd_blacklist_icons";

function loadMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

/** Gère la blacklist d'apps : ids (source de vérité côté Rust) + nom & icône (local). */
export function useBlacklist() {
  const [ids, setIds] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>(() => loadMap(NAMES_KEY));
  const [icons, setIcons] = useState<Record<string, string>>(() => loadMap(ICONS_KEY));

  useEffect(() => {
    tauri.getBlacklist().then(setIds).catch(() => {});
  }, []);

  const commit = useCallback((next: string[]) => {
    setIds(next);
    tauri.setBlacklist(next).catch((e) => console.error("set_blacklist", e));
  }, []);

  const add = useCallback(
    (app: AppRef) => {
      if (ids.includes(app.bundle_id)) return;
      const nextNames = { ...names, [app.bundle_id]: app.name };
      setNames(nextNames);
      localStorage.setItem(NAMES_KEY, JSON.stringify(nextNames));
      if (app.icon) {
        const nextIcons = { ...icons, [app.bundle_id]: app.icon };
        setIcons(nextIcons);
        localStorage.setItem(ICONS_KEY, JSON.stringify(nextIcons));
      }
      commit([...ids, app.bundle_id]);
    },
    [ids, names, icons, commit],
  );

  const remove = useCallback((id: string) => commit(ids.filter((x) => x !== id)), [ids, commit]);

  /** Complète les icônes manquantes des apps blacklistées depuis une liste chargée. */
  const backfillIcons = useCallback(
    (list: AppRef[]) => {
      setIcons((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const app of list) {
          if (app.icon && !next[app.bundle_id] && ids.includes(app.bundle_id)) {
            next[app.bundle_id] = app.icon;
            changed = true;
          }
        }
        if (changed) localStorage.setItem(ICONS_KEY, JSON.stringify(next));
        return changed ? next : prev;
      });
    },
    [ids],
  );

  const nameOf = useCallback((id: string) => names[id] || id, [names]);
  const iconOf = useCallback((id: string): string | undefined => icons[id], [icons]);

  return { ids, add, remove, nameOf, iconOf, backfillIcons };
}
