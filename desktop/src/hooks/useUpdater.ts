import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Vérifie une mise à jour au lancement ; si dispo : télécharge, installe, relance.
 * En dev (pas d'artifacts updater / endpoint injoignable), check() échoue → no-op. */
export function useUpdater() {
  useEffect(() => {
    (async () => {
      try {
        const update = await check();
        if (update?.available) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch (e) {
        console.error("updater", e);
      }
    })();
  }, []);
}
