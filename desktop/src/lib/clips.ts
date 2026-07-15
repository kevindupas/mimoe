import { tauri } from "./tauri";
import type { Clip, FrontendConfig, RawClip } from "./types";

/** Déchiffre un clip brut (juste l'AES, rapide). L'image n'est PAS chargée ici :
 * elle l'est à la demande par la card (cache disque), pour un rendu instantané. */
export async function decryptRaw(
  raw: RawClip,
  config: FrontendConfig,
): Promise<Clip | null> {
  try {
    const text = await tauri.decryptClip(raw.ciphertext, raw.nonce);
    const kind = raw.kind === "image" ? "image" : raw.kind === "file" ? "file" : "text";
    const hasBlob = (kind === "image" || kind === "file") && !!raw.blob_id;
    return {
      id: raw.id,
      origin_device_id: raw.origin_device_id,
      kind,
      text,
      blobId: hasBlob ? raw.blob_id! : undefined,
      mime: raw.mime ?? "image/png",
      pinned: raw.pinned ?? false,
      is_sensitive: raw.is_sensitive,
      created_at: raw.created_at,
      mine: raw.origin_device_id === config.device_id,
    };
  } catch (e) {
    console.error("decrypt", raw.id, e);
    return null;
  }
}
