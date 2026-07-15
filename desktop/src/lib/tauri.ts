import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { FrontendConfig } from "./types";

/** Fines enveloppes typées autour des commandes Rust (Tauri). */
export const tauri = {
  isConfigured: () => invoke<boolean>("is_configured"),
  setPaused: (paused: boolean) => invoke("set_paused", { paused }),
  getConfig: () => invoke<FrontendConfig>("get_config"),
  setup: (args: {
    serverUrl: string;
    deviceId: string;
    deviceToken: string;
    userId: number;
    passphrase: string;
    reverbAppKey: string;
    reverbHost: string;
    reverbPort: number;
    reverbScheme: string;
  }) => invoke("setup", args),
  unpair: () => invoke("unpair"),
  hideWindow: () => invoke("hide_window"),
  decryptClip: (ciphertext: string, nonce: string) =>
    invoke<string>("decrypt_clip", { ciphertext, nonce }),
  /** Met l'image en cache disque (déchiffrée) et renvoie une URL file:// utilisable en <img>. */
  imageSrc: async (blobId: string) => convertFileSrc(await invoke<string>("cache_image", { blobId })),
  copyText: (text: string) => invoke("copy_to_clipboard", { text }),
  /** Copie l'image (par blob) dans le presse-papier, décodage côté Rust (pas de base64 IPC). */
  copyImage: (blobId: string) => invoke("copy_image_cached", { blobId }),
  /** Copie un fichier (par blob) dans le presse-papier (file-url) → collable ailleurs. */
  copyFile: (blobId: string, name: string) => invoke("copy_file", { blobId, name }),
  /** Nettoie le cache disque des images qui ne sont plus dans l'historique. */
  pruneImageCache: (keep: string[]) => invoke("prune_image_cache", { keep }),
  openUrl: (url: string) => openUrl(url),
  listRunningApps: () => invoke<RunningApp[]>("list_running_apps"),
  listInstalledApps: () => invoke<InstalledApp[]>("list_installed_apps"),
  getBlacklist: () => invoke<string[]>("get_blacklist"),
  setBlacklist: (bundleIds: string[]) => invoke("set_blacklist", { bundleIds }),
};

export interface RunningApp {
  name: string;
  bundle_id: string;
}

export interface InstalledApp {
  name: string;
  bundle_id: string;
  icon?: string | null;
}
