// BIP39 seed phrase: generation, normalization, validation.
//
// Strict mirror of desktop/src-tauri/src/seed.rs. The seed is a plain string
// passed to deriveKey: the salt, Argon2 and the interop do not change.
//
// IMPORTANT: `normalize` must produce exactly the same result as the Rust
// version, otherwise phone and Mac derive different keys and nothing
// decrypts. The order of the steps is part of the contract.
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as Crypto from "expo-crypto";

/** 128 bits of entropy + 4 bits of checksum = 12 words. */
export const WORD_COUNT = 12;
const ENTROPY_BYTES = 16;

/**
 * Generates a 12-word seed.
 *
 * The entropy comes from expo-crypto rather than the lib's `generateMnemonic`:
 * the latter relies on `crypto.getRandomValues`, absent from the React Native
 * runtime without a polyfill. Never Math.random().
 */
export function generateSeed(): string[] {
  const entropy = Crypto.getRandomBytes(ENTROPY_BYTES);
  return entropyToMnemonic(entropy, wordlist).split(" ");
}

/**
 * Normalizes a seed before derivation: NFKD, lowercase, trim, multiple
 * spaces collapsed to a single one — in that order.
 *
 * deriveKey hashes the raw bytes of the string: a single uppercase letter or an
 * extra space is enough to produce a different key and a silent failure.
 */
export function normalizeSeed(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Words outside the BIP39 wordlist, for immediate feedback while typing. */
export function unknownWords(input: string): string[] {
  const set = new Set(wordlist);
  return normalizeSeed(input)
    .split(" ")
    .filter((w) => w && !set.has(w));
}

/**
 * Validates an entered seed: word count, wordlist, then checksum.
 *
 * The checksum is the whole point of BIP39 here: it catches the valid but
 * misplaced word that the wordlist alone does not see. Without it, a typo
 * derives a different key, pairing "succeeds" and the user sees an empty
 * history without the slightest clue.
 *
 * Returns null if valid, otherwise the reason for rejection.
 */
export function validateSeed(input: string): string | null {
  const norm = normalizeSeed(input);
  const words = norm ? norm.split(" ") : [];

  if (words.length !== WORD_COUNT) {
    return `The seed must be ${WORD_COUNT} words (got ${words.length}).`;
  }
  const unknown = unknownWords(norm);
  if (unknown.length) {
    return `Word not in the list: « ${unknown[0]} ».`;
  }
  if (!validateMnemonic(norm, wordlist)) {
    return "Invalid seed: a word is wrong or misplaced.";
  }
  return null;
}
