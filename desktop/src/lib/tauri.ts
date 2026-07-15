import { invoke } from "@tauri-apps/api/core";
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
  fetchImage: (blobId: string) => invoke<string>("fetch_image", { blobId }),
  copyText: (text: string) => invoke("copy_to_clipboard", { text }),
  copyImage: (pngB64: string) => invoke("copy_image", { pngB64 }),
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
