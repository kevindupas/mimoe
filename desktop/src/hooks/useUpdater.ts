import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Checks for an update at launch; if available: downloads, installs, relaunches.
 * In dev (no updater artifacts / unreachable endpoint), check() fails → no-op. */
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
