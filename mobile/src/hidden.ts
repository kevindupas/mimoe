// Hidden cards (content hidden in place) — local to the device, persisted.
// It's a privacy convenience: it deletes nothing on the server side.
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
