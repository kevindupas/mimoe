import type { AuthMode, FrontendConfig, RawClip } from "./types";

/** Appels HTTP au serveur Mimoe (le serveur ne voit que du chiffré). */

export async function fetchClips(config: FrontendConfig): Promise<RawClip[]> {
  const res = await fetch(`${config.server_url}/api/clips`, {
    headers: {
      Authorization: `Bearer ${config.device_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.json();
  return body.data ?? [];
}

export async function pinClip(
  config: FrontendConfig,
  id: string,
  pinned: boolean,
): Promise<void> {
  const res = await fetch(`${config.server_url}/api/clip/${id}/pin`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.device_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ pinned }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function deleteClip(config: FrontendConfig, id: string): Promise<void> {
  const res = await fetch(`${config.server_url}/api/clip/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.device_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

/**
 * Capacités de l'instance, interrogées dès que l'URL du serveur est connue.
 *
 * Une instance antérieure à cet endpoint répond 404 : on suppose alors les
 * inscriptions ouvertes. Bloquer sur un doute empêcherait de créer un compte sur
 * un serveur parfaitement ouvert, ce qui est pire que de laisser tenter — le
 * /register renverra 403 le cas échéant.
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

export interface PairResult {
  token: string;
  user_id: number;
  reverb_app_key: string;
  reverb_host: string;
  reverb_port: number;
  reverb_scheme: string;
}

export async function pair(
  serverUrl: string,
  mode: AuthMode,
  email: string,
  password: string,
  deviceId: string,
): Promise<PairResult> {
  const res = await fetch(`${serverUrl}/api/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email,
      password,
      device_id: deviceId,
      device_name: "Desktop",
      platform: "macos",
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body?.message ||
      (res.status === 422 ? "identifiants invalides" : `erreur ${res.status}`);
    throw new Error(msg);
  }
  return res.json();
}
