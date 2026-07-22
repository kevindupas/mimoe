import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { FrontendConfig } from "./types";

/** Thin typed wrappers around the Rust commands (Tauri). */
export const tauri = {
  isConfigured: () => invoke<boolean>("is_configured"),
  setPaused: (paused: boolean) => invoke("set_paused", { paused }),
  /** Generates the 12-word seed (first device). Never leaves the machine. */
  generateSeed: () => invoke<string[]>("generate_seed"),
  /** Validates a typed seed (wordlist + checksum) before pairing. Rejects with the reason. */
  validateSeed: (words: string) => invoke<void>("validate_seed", { words }),
  seedWordlist: () => invoke<string[]>("seed_wordlist"),
  /** Copies the seed marked as sensitive: kept out of clipboard managers' history. */
  copySeed: (words: string[]) => invoke<void>("copy_seed", { words }),
  getConfig: () => invoke<FrontendConfig>("get_config"),
  setup: (args: {
    serverUrl: string;
    deviceId: string;
    deviceToken: string;
    userId: number;
    email: string;
    passphrase: string;
    reverbAppKey: string;
    reverbHost: string;
    reverbPort: number;
    reverbScheme: string;
  }) => invoke("setup", args),
  /** Persists the account email (fallback for pre-email installs, from /api/me). */
  updateEmail: (email: string) => invoke("update_email", { email }),
  unpair: () => invoke("unpair"),
  hideWindow: () => invoke("hide_window"),
  decryptClip: (ciphertext: string, nonce: string) =>
    invoke<string>("decrypt_clip", { ciphertext, nonce }),
  /** Writes the image to the disk cache (decrypted) and returns a file:// URL usable in <img>. */
  imageSrc: async (blobId: string) => convertFileSrc(await invoke<string>("cache_image", { blobId })),
  copyText: (text: string) => invoke("copy_to_clipboard", { text }),
  /** Copies the image (by blob) to the clipboard, decoding on the Rust side (no base64 over IPC). */
  copyImage: (blobId: string) => invoke("copy_image_cached", { blobId }),
  /** Copies a file (by blob) to the clipboard (file-url) → pasteable elsewhere. */
  copyFile: (blobId: string, name: string) => invoke("copy_file", { blobId, name }),
  /** Prunes the disk cache of images that are no longer in the history. */
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
