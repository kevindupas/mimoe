// Local cache of clips for an INSTANT display on cold start.
// We persist ENCRYPTED clips (ciphertext) — never plaintext on disk,
// to stay consistent with E2E. On startup we decrypt them (fast, CPU) and paint,
// then refresh from the server in the background.
import * as FileSystem from "expo-file-system/legacy";
import type { RawClip } from "./api";

const FILE = FileSystem.documentDirectory + "clips-cache.json";
const MAX = 50;

export async function loadClipCache(): Promise<RawClip[]> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    return JSON.parse(await FileSystem.readAsStringAsync(FILE));
  } catch {
    return [];
  }
}

export async function saveClipCache(raws: RawClip[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(raws.slice(0, MAX)));
  } catch {}
}
