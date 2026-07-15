import { tauri } from "./tauri";
import type { Clip, FrontendConfig, RawClip } from "./types";

/** Déchiffre un clip brut (via Rust) et charge l'image si besoin. */
export async function decryptRaw(
  raw: RawClip,
  config: FrontendConfig,
): Promise<Clip | null> {
  try {
    const text = await tauri.decryptClip(raw.ciphertext, raw.nonce);
    const isImage = raw.kind === "image" && !!raw.blob_id;
    let imageB64: string | undefined;
    if (isImage) {
      try {
        imageB64 = await tauri.fetchImage(raw.blob_id!);
      } catch (e) {
        console.error("fetch_image", raw.id, e);
        return null;
      }
    }
    return {
      id: raw.id,
      origin_device_id: raw.origin_device_id,
      kind: isImage ? "image" : "text",
      text,
      imageB64,
      mime: raw.mime ?? "image/png",
      is_sensitive: raw.is_sensitive,
      created_at: raw.created_at,
      mine: raw.origin_device_id === config.device_id,
    };
  } catch (e) {
    console.error("decrypt", raw.id, e);
    return null;
  }
}
