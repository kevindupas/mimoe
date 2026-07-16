// Seed phrase BIP39 : generation, normalisation, validation.
//
// Miroir strict de desktop/src-tauri/src/seed.rs. La seed est une simple chaine
// passee a deriveKey : le sel, Argon2 et l'interop ne changent pas.
//
// IMPORTANT : `normalize` doit produire exactement le meme resultat que la
// version Rust, sinon telephone et Mac derivent des cles differentes et rien ne
// se dechiffre. L'ordre des etapes fait partie du contrat.
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as Crypto from "expo-crypto";

/** 128 bits d'entropie + 4 bits de checksum = 12 mots. */
export const WORD_COUNT = 12;
const ENTROPY_BYTES = 16;

/**
 * Genere une seed de 12 mots.
 *
 * L'entropie vient d'expo-crypto plutot que du `generateMnemonic` de la lib :
 * celui-ci s'appuie sur `crypto.getRandomValues`, absent du runtime React Native
 * sans polyfill. Jamais Math.random().
 */
export function generateSeed(): string[] {
  const entropy = Crypto.getRandomBytes(ENTROPY_BYTES);
  return entropyToMnemonic(entropy, wordlist).split(" ");
}

/**
 * Normalise une seed avant derivation : NFKD, minuscules, trim, espaces
 * multiples reduites a une seule — dans cet ordre.
 *
 * deriveKey hache les octets bruts de la chaine : une majuscule ou une espace en
 * trop suffit a produire une cle differente et un echec silencieux.
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

/** Mots hors wordlist BIP39, pour un retour immediat pendant la saisie. */
export function unknownWords(input: string): string[] {
  const set = new Set(wordlist);
  return normalizeSeed(input)
    .split(" ")
    .filter((w) => w && !set.has(w));
}

/**
 * Valide une seed saisie : nombre de mots, wordlist, puis checksum.
 *
 * Le checksum est la raison d'etre de BIP39 ici : il attrape le mot valide mais
 * mal place, que la wordlist seule ne voit pas. Sans lui, une faute de frappe
 * derive une cle differente, l'appairage "reussit" et l'utilisateur voit un
 * historique vide sans le moindre indice.
 *
 * Retourne null si valide, sinon le motif du rejet.
 */
export function validateSeed(input: string): string | null {
  const norm = normalizeSeed(input);
  const words = norm ? norm.split(" ") : [];

  if (words.length !== WORD_COUNT) {
    return `La seed doit faire ${WORD_COUNT} mots (reçu : ${words.length}).`;
  }
  const unknown = unknownWords(norm);
  if (unknown.length) {
    return `Mot inconnu : « ${unknown[0]} ».`;
  }
  if (!validateMnemonic(norm, wordlist)) {
    return "Seed invalide : un mot est erroné ou mal placé.";
  }
  return null;
}
