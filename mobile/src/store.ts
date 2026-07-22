// Config + secrets in expo-secure-store (iOS Keychain / Android Keystore).
import * as SecureStore from "expo-secure-store";
import { bytesToBase64, base64ToBytes } from "./crypto";

export interface Config {
  serverUrl: string;
  deviceId: string;
  userId: number;
  email: string;
  deviceToken: string;
  reverbAppKey: string;
  reverbPort: number;
}

const KEYS = [
  "server_url", "device_id", "user_id", "email", "device_token", "reverb_app_key", "reverb_port", "enc_key",
] as const;

export async function loadConfig(): Promise<Config | null> {
  const serverUrl = await SecureStore.getItemAsync("server_url");
  const deviceId = await SecureStore.getItemAsync("device_id");
  const deviceToken = await SecureStore.getItemAsync("device_token");
  const encKey = await SecureStore.getItemAsync("enc_key");
  if (!serverUrl || !deviceId || !deviceToken || !encKey) return null;
  return {
    serverUrl,
    deviceId,
    userId: Number(await SecureStore.getItemAsync("user_id")) || 0,
    email: (await SecureStore.getItemAsync("email")) || "",
    deviceToken,
    reverbAppKey: (await SecureStore.getItemAsync("reverb_app_key")) || "",
    reverbPort: Number(await SecureStore.getItemAsync("reverb_port")) || 443,
  };
}

/** Persists just the account email (fallback for pre-email installs, from /api/me). */
export async function saveEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync("email", email);
}

export async function saveConfig(c: Config, key: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync("server_url", c.serverUrl);
  await SecureStore.setItemAsync("device_id", c.deviceId);
  await SecureStore.setItemAsync("user_id", String(c.userId));
  await SecureStore.setItemAsync("email", c.email);
  await SecureStore.setItemAsync("device_token", c.deviceToken);
  await SecureStore.setItemAsync("reverb_app_key", c.reverbAppKey);
  await SecureStore.setItemAsync("reverb_port", String(c.reverbPort));
  await SecureStore.setItemAsync("enc_key", bytesToBase64(key));
}

export async function getKey(): Promise<Uint8Array | null> {
  const b64 = await SecureStore.getItemAsync("enc_key");
  return b64 ? base64ToBytes(b64) : null;
}

/** Reverb host = server host (we don't trust a returned localhost). */
export function reverbHost(serverUrl: string): string {
  try { return new URL(serverUrl).hostname; } catch { return ""; }
}
export function reverbTls(serverUrl: string): boolean {
  return serverUrl.startsWith("https");
}

export async function clearConfig(): Promise<void> {
  for (const k of KEYS) await SecureStore.deleteItemAsync(k);
}
