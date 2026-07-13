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
  ciphertext: string, nonce: string, isSensitive = false,
): Promise<boolean> {
  const res = await fetch(`${serverUrl}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: Crypto.randomUUID(),
      origin_device_id: deviceId,
      ciphertext, nonce,
      is_sensitive: isSensitive,
      created_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

export async function fetchHistory(serverUrl: string, token: string): Promise<RawClip[]> {
  const res = await fetch(`${serverUrl}/api/clips`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data ?? [];
}
