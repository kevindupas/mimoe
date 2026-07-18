// HTTP calls to the Mimoe server. Content encrypted beforehand.
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
  mime?: string | null;
  pinned?: boolean;
  ciphertext: string;
  nonce: string;
  is_sensitive: boolean;
  created_at: string;
}

export function newDeviceId(): string {
  return Crypto.randomUUID();
}

/** Registration or login. path = "register" | "login". */
/**
 * Instance capabilities, queried as soon as the server URL is known.
 *
 * An instance predating this endpoint responds 404: we then assume
 * registrations are open. Blocking on a doubt would prevent creating an account
 * on an open server, which is worse than letting the attempt through — /register
 * will return 403 if applicable.
 */
export async function fetchServerInfo(serverUrl: string): Promise<{ registrationEnabled: boolean }> {
  try {
    const res = await fetch(`${serverUrl}/api/server-info`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { registrationEnabled: true };
    const body = await res.json();
    return { registrationEnabled: body?.registration_enabled !== false };
  } catch {
    return { registrationEnabled: true };
  }
}

/** Deletes the account and all its data on the server side (right to erasure). */
export async function deleteAccount(serverUrl: string, token: string): Promise<boolean> {
  const res = await fetch(`${serverUrl}/api/account`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

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
  opts: { kind?: "text" | "image"; blobId?: string; isSensitive?: boolean; dedupHash?: string } = {},
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
      // Dedup fingerprint (keyed HMAC): lets the server merge this
      // content with an identical clip already present, without seeing the content.
      dedup_hash: opts.dedupHash ?? null,
      is_sensitive: opts.isSensitive ?? false,
      created_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

/** Uploads an encrypted blob (image). Returns its id. */
export async function postBlob(serverUrl: string, token: string, data: string, nonce: string): Promise<string> {
  const res = await fetch(`${serverUrl}/api/blob`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data, nonce }),
  });
  if (!res.ok) throw new Error(`POST /blob ${res.status}`);
  return (await res.json()).id;
}

/** Fetches an encrypted blob. */
export async function fetchBlob(serverUrl: string, token: string, id: string): Promise<{ data: string; nonce: string }> {
  const res = await fetch(`${serverUrl}/api/blob/${id}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /blob ${res.status}`);
  return res.json();
}

/** Deletes a clip (and its blob) on the server side. The broadcast removes it from the other devices. */
export async function deleteClip(serverUrl: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${serverUrl}/api/clip/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE /clip ${res.status}`);
}

/** Pins / unpins a clip (survives the TTL and the cap). */
export async function pinClip(
  serverUrl: string,
  token: string,
  id: string,
  pinned: boolean,
): Promise<void> {
  const res = await fetch(`${serverUrl}/api/clip/${id}/pin`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pinned }),
  });
  if (!res.ok) throw new Error(`PATCH /pin ${res.status}`);
}

/** Registers this device's native push token (FCM) with the server. */
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
