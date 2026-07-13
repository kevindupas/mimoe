// Cache disque des images déchiffrées. Une image n'est téléchargée + déchiffrée
// QU'UNE fois : ensuite lue depuis un fichier local (file://), jamais re-download,
// jamais gardée en base64 en RAM dans la liste. Vide l'écran de sa lenteur.
import * as FileSystem from "expo-file-system/legacy";
import { fetchBlob } from "./api";
import { bytesToBase64, decryptBytes } from "./crypto";
import { getKey, type Config } from "./store";

const DIR = FileSystem.cacheDirectory + "clipimg/";

// Clé de déchiffrement mise en cache module (évite de relire le SecureStore à chaque image).
let cachedKey: Uint8Array | null = null;
async function theKey(): Promise<Uint8Array | null> {
  return cachedKey ?? (cachedKey = await getKey());
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function pathFor(clipId: string): string {
  return DIR + clipId + ".png";
}

/** URI fichier local de l'image (télécharge + déchiffre + met en cache si absente). */
export async function getClipImageUri(cfg: Config, clipId: string, blobId: string): Promise<string | null> {
  try {
    await ensureDir();
    const path = pathFor(clipId);
    if ((await FileSystem.getInfoAsync(path)).exists) return path; // déjà en cache

    const key = await theKey();
    if (!key) return null;
    const blob = await fetchBlob(cfg.serverUrl, cfg.deviceToken, blobId);
    const b64 = bytesToBase64(decryptBytes(key, blob.data, blob.nonce));
    await FileSystem.writeAsStringAsync(path, b64, { encoding: "base64" });
    return path;
  } catch {
    return null;
  }
}

/** Vire les images en cache qui ne sont plus dans la liste courante (évite que le cache
 * grossisse à l'infini). Appelé après chaque refresh de l'historique. Best-effort. */
export async function pruneImageCache(keepClipIds: string[]): Promise<void> {
  try {
    if (!(await FileSystem.getInfoAsync(DIR)).exists) return;
    const keep = new Set(keepClipIds.map((id) => id + ".png"));
    const files = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(
      files
        .filter((f) => !keep.has(f))
        .map((f) => FileSystem.deleteAsync(DIR + f, { idempotent: true })),
    );
  } catch {}
}

/** Base64 du PNG déchiffré (pour la copie presse-papier). Passe par le cache disque. */
export async function getClipImageBase64(cfg: Config, clipId: string, blobId: string): Promise<string | null> {
  const uri = await getClipImageUri(cfg, clipId, blobId);
  if (!uri) return null;
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  } catch {
    return null;
  }
}
