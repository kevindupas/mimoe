// Cache local des clips pour un affichage INSTANT à l'ouverture à froid.
// On persiste les clips CHIFFRÉS (ciphertext) — jamais le texte en clair sur disque,
// pour rester cohérent E2E. Au démarrage on les déchiffre (rapide, CPU) et on peint,
// puis on refresh depuis le serveur en fond.
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
