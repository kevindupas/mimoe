// Crypto E2E, interop STRICTE avec Rust (desktop) et Kotlin (ancien Android) :
// Argon2id (même sel + params) -> clé AES-256 -> AES-256-GCM.
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";
import * as Crypto from "expo-crypto";
import argon2 from "react-native-argon2";

const SHARED_SALT = "clipd::v1::shared-salt::do-not-change";

// --- base64 <-> bytes (sans dépendance) ---
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let bits = 0, val = 0, p = 0;
  for (const ch of clean) {
    val = (val << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[p++] = (val >> bits) & 0xff; }
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}


/** Dérive la clé AES-256 (32 octets) via Argon2id. Params identiques Rust/Kotlin. */
export async function deriveKey(passphrase: string): Promise<Uint8Array> {
  const res = await argon2(passphrase, SHARED_SALT, {
    iterations: 3,
    memory: 64 * 1024,
    parallelism: 1,
    hashLength: 32,
    mode: "argon2id",
  });
  return hexToBytes(res.rawHash);
}

/** Chiffre. Retourne (ciphertext, nonce) en base64. Nonce 12 octets aléatoire. */
export function encrypt(key: Uint8Array, plaintext: string): { ciphertext: string; nonce: string } {
  const nonce = Crypto.getRandomBytes(12);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(plaintext)); // ct||tag
  return { ciphertext: bytesToBase64(ct), nonce: bytesToBase64(nonce) };
}

/** Déchiffre un clip reçu. */
export function decrypt(key: Uint8Array, ciphertextB64: string, nonceB64: string): string {
  const ct = base64ToBytes(ciphertextB64);
  const nonce = base64ToBytes(nonceB64);
  return bytesToUtf8(gcm(key, nonce).decrypt(ct));
}

/** Chiffre des octets bruts (image). Retourne (ciphertext, nonce) en base64. */
export function encryptBytes(key: Uint8Array, plain: Uint8Array): { ciphertext: string; nonce: string } {
  const nonce = Crypto.getRandomBytes(12);
  const ct = gcm(key, nonce).encrypt(plain);
  return { ciphertext: bytesToBase64(ct), nonce: bytesToBase64(nonce) };
}

/** Déchiffre des octets bruts. Retourne les octets. */
export function decryptBytes(key: Uint8Array, ciphertextB64: string, nonceB64: string): Uint8Array {
  return gcm(key, base64ToBytes(nonceB64)).decrypt(base64ToBytes(ciphertextB64));
}
