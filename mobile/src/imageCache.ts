// Disk cache of decrypted images. An image is downloaded + decrypted
// ONLY once: afterwards read from a local file (file://), never re-downloaded,
// never kept as base64 in RAM in the list. Rids the screen of its slowness.
import * as FileSystem from "expo-file-system/legacy";
import { fetchBlob } from "./api";
import { bytesToBase64, decompressBytes, decryptBytes } from "./crypto";
import { getKey, type Config } from "./store";

const DIR = FileSystem.cacheDirectory + "clipimg/";

// Decryption key cached at module level (avoids re-reading SecureStore for each image).
let cachedKey: Uint8Array | null = null;
async function theKey(): Promise<Uint8Array | null> {
  return cachedKey ?? (cachedKey = await getKey());
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// clipId/blobId come from the server (untrusted source under E2E). We require the
// UUID format before building a file path, otherwise a "../" would traverse the cache.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function pathFor(clipId: string): string {
  return DIR + clipId + ".png";
}

/** Local file URI of the image (downloads + decrypts + caches if absent). */
export async function getClipImageUri(cfg: Config, clipId: string, blobId: string): Promise<string | null> {
  try {
    if (!isUuid(clipId) || !isUuid(blobId)) return null;
    await ensureDir();
    const path = pathFor(clipId);
    if ((await FileSystem.getInfoAsync(path)).exists) return path; // already cached

    const key = await theKey();
    if (!key) return null;
    const blob = await fetchBlob(cfg.serverUrl, cfg.deviceToken, blobId);
    const b64 = bytesToBase64(decompressBytes(decryptBytes(key, blob.data, blob.nonce)));
    await FileSystem.writeAsStringAsync(path, b64, { encoding: "base64" });
    return path;
  } catch {
    return null;
  }
}

/** Drops the cached images that are no longer in the current list (prevents the cache
 * from growing indefinitely). Called after each history refresh. Best-effort. */
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

/** Base64 of the decrypted PNG (for the clipboard copy). Goes through the disk cache. */
export async function getClipImageBase64(cfg: Config, clipId: string, blobId: string): Promise<string | null> {
  const uri = await getClipImageUri(cfg, clipId, blobId);
  if (!uri) return null;
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  } catch {
    return null;
  }
}

/** Downloads + decrypts a file to a named local file (for share/save).
 * Keeps the real name so apps recognize the type. */
export async function getClipFileUri(
  cfg: Config,
  clipId: string,
  blobId: string,
  name: string,
): Promise<string | null> {
  try {
    if (!isUuid(clipId) || !isUuid(blobId)) return null;
    await ensureDir();
    // clipId is a UUID (validated); we just neutralize separators and ".." in the name.
    const safe = name.replace(/[/\\]/g, "_").replace(/\.\./g, "_") || "file";
    const path = `${DIR}${clipId}-${safe}`;
    if ((await FileSystem.getInfoAsync(path)).exists) return path;

    const key = await theKey();
    if (!key) return null;
    const blob = await fetchBlob(cfg.serverUrl, cfg.deviceToken, blobId);
    const b64 = bytesToBase64(decompressBytes(decryptBytes(key, blob.data, blob.nonce)));
    await FileSystem.writeAsStringAsync(path, b64, { encoding: "base64" });
    return path;
  } catch {
    return null;
  }
}
