// Appels HTTP au serveur Clipd. Contenu chiffré en amont.
import * as Crypto from "expo-crypto";

export interface AuthResult {
  token: string;
  userId: number;
  reverbAppKey: string;
  reverbPort: number;
}

export interface RawClip {
  id: string;
  origin_device_id: string;
  kind?: string;
  blob_id?: string | null;
  ciphertext: string;
  nonce: string;
  is_sensitive: boolean;
  created_at: string;
}

export function newDeviceId(): string {
  return Crypto.randomUUID();
}

/** Inscription ou connexion. path = "register" | "login". */
export async function auth(
  serverUrl: string, path: "register" | "login",
  email: string, password: string, deviceId: string,
): Promise<AuthResult> {
  const res = await fetch(`${serverUrl}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email, password, device_id: deviceId, device_name: "Mobile", platform: "android",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || (res.status === 422 ? "identifiants invalides" : `erreur ${res.status}`));
  return {
    token: body.token,
    userId: body.user_id,
    reverbAppKey: body.reverb_app_key,
    reverbPort: body.reverb_port ?? 443,
  };
}

export async function postClip(
  serverUrl: string, token: string, deviceId: string,
  ciphertext: string, nonce: string,
  opts: { kind?: "text" | "image"; blobId?: string; isSensitive?: boolean } = {},
): Promise<boolean> {
  const res = await fetch(`${serverUrl}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: Crypto.randomUUID(),
      origin_device_id: deviceId,
      kind: opts.kind ?? "text",
      blob_id: opts.blobId ?? null,
      ciphertext, nonce,
      is_sensitive: opts.isSensitive ?? false,
      created_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

/** Upload d'un blob chiffré (image). Retourne son id. */
export async function postBlob(serverUrl: string, token: string, data: string, nonce: string): Promise<string> {
  const res = await fetch(`${serverUrl}/api/blob`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data, nonce }),
  });
  if (!res.ok) throw new Error(`POST /blob ${res.status}`);
  return (await res.json()).id;
}

/** Récupère un blob chiffré. */
export async function fetchBlob(serverUrl: string, token: string, id: string): Promise<{ data: string; nonce: string }> {
  const res = await fetch(`${serverUrl}/api/blob/${id}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /blob ${res.status}`);
  return res.json();
}

/** Supprime un clip (et son blob) cote serveur. Le broadcast retire les autres appareils. */
export async function deleteClip(serverUrl: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${serverUrl}/api/clip/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE /clip ${res.status}`);
}

/** Enregistre le token push natif (FCM) de cet appareil aupres du serveur. */
export async function registerPushToken(
  serverUrl: string,
  token: string,
  deviceId: string,
  fcmToken: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/api/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_id: deviceId, token: fcmToken, platform: "android" }),
  });
  if (!res.ok) throw new Error(`POST /push-token ${res.status}`);
}

export async function fetchHistory(serverUrl: string, token: string): Promise<RawClip[]> {
  const res = await fetch(`${serverUrl}/api/clips`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data ?? [];
}
