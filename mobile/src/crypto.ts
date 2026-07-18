// E2E crypto, STRICT interop with Rust (desktop) and Kotlin (old Android):
// Argon2id (same salt + params) -> AES-256 key -> AES-256-GCM.
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";
import argon2 from "react-native-argon2";
import { ungzip } from "pako";

const SHARED_SALT = "mimoe::v1::shared-salt::do-not-change";

const DEDUP_LABEL = utf8ToBytes("mimoe/dedup/v1");

/**
 * Dedup fingerprint: HMAC-SHA256 of the content under a DEDICATED subkey.
 * Strict mirror of `crypto::dedup_fingerprint` (desktop) — verified identical on
 * a known vector. Domain separation: we derive `k_mac = HMAC(key, label)`
 * instead of using the raw encryption key as the HMAC key. The server can
 * guess neither the content nor the key.
 */
export function dedupFingerprint(key: Uint8Array, data: Uint8Array): string {
  const kMac = hmac(sha256, key, DEDUP_LABEL);
  return bytesToHex(hmac(sha256, kMac, data));
}

/** Fingerprint of a text: UTF-8 bytes, like the desktop. */
export function dedupFingerprintText(key: Uint8Array, text: string): string {
  return dedupFingerprint(key, utf8ToBytes(text));
}

// --- base64 <-> bytes (dependency-free) ---
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


/** Derives the AES-256 key (32 bytes) via Argon2id. Params identical to Rust/Kotlin. */
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

/** Encrypts. Returns (ciphertext, nonce) in base64. Random 12-byte nonce. */
export function encrypt(key: Uint8Array, plaintext: string): { ciphertext: string; nonce: string } {
  const nonce = Crypto.getRandomBytes(12);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(plaintext)); // ct||tag
  return { ciphertext: bytesToBase64(ct), nonce: bytesToBase64(nonce) };
}

/** Decrypts a received clip. */
export function decrypt(key: Uint8Array, ciphertextB64: string, nonceB64: string): string {
  const ct = base64ToBytes(ciphertextB64);
  const nonce = base64ToBytes(nonceB64);
  return bytesToUtf8(gcm(key, nonce).decrypt(ct));
}

/** Encrypts raw bytes (image). Returns (ciphertext, nonce) in base64. */
export function encryptBytes(key: Uint8Array, plain: Uint8Array): { ciphertext: string; nonce: string } {
  const nonce = Crypto.getRandomBytes(12);
  const ct = gcm(key, nonce).encrypt(plain);
  return { ciphertext: bytesToBase64(ct), nonce: bytesToBase64(nonce) };
}

/** Decrypts raw bytes. Returns the bytes. */
export function decryptBytes(key: Uint8Array, ciphertextB64: string, nonceB64: string): Uint8Array {
  return gcm(key, base64ToBytes(nonceB64)).decrypt(base64ToBytes(ciphertextB64));
}

// --- Blob decompression (mirror of blobz.rs on the desktop side) ---
// Format: magic prefix "CLZ1" + gzip. Without prefix = raw bytes.
export function decompressBytes(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x43 && bytes[1] === 0x4c && bytes[2] === 0x5a && bytes[3] === 0x31
  ) {
    return ungzip(bytes.subarray(4));
  }
  return bytes;
}
