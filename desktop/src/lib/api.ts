import type { AuthMode, FrontendConfig, RawClip } from "./types";

/** HTTP calls to the Mimoe server (the server only ever sees encrypted data). */

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
 * Instance capabilities, queried as soon as the server URL is known.
 *
 * An instance older than this endpoint answers 404: we then assume registration
 * is open. Blocking on a doubt would prevent creating an account on a perfectly
 * open server, which is worse than letting the attempt through — /register will
 * return 403 if need be.
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
export async function deleteAccount(config: FrontendConfig): Promise<void> {
  const res = await fetch(`${config.server_url}/api/account`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.device_token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
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
