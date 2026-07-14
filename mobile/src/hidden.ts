// Cards masquées (contenu caché sur place) — local à l'appareil, persisté.
// C'est un confort de confidentialité : ça ne supprime rien côté serveur.
import * as FileSystem from "expo-file-system/legacy";

const FILE = FileSystem.documentDirectory + "hidden-clips.json";

export async function loadHidden(): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    return JSON.parse(await FileSystem.readAsStringAsync(FILE));
  } catch {
    return [];
  }
}

export async function saveHidden(ids: string[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(ids));
  } catch {}
}
