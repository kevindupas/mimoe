export type ContentKind = "url" | "color" | "code" | "plain";

export interface Detected {
  kind: ContentKind;
  /** Couleur normalisée (#rrggbb…) si kind === "color". */
  color?: string;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const URL_ONLY = /^https?:\/\/[^\s]+$/i;

/** Heuristique légère : le texte ressemble-t-il à du code ? */
function looksLikeCode(t: string): boolean {
  if (!t.includes("\n")) return false;
  const signals = /[{};]|=>|\bfunction\b|\bconst\b|\bimport\b|\bdef\b|<\/?[a-zA-Z]/;
  if (!signals.test(t)) return false;
  const lines = t.split("\n");
  const indented = lines.filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  const braces = (t.match(/[{};]/g) || []).length;
  return indented >= 1 || braces >= 2;
}

/** Détecte le type de contenu d'un clip texte pour proposer une action typée. */
export function detectContent(text: string): Detected {
  const t = text.trim();
  if (HEX_COLOR.test(t)) return { kind: "color", color: t };
  if (URL_ONLY.test(t)) return { kind: "url" };
  if (looksLikeCode(t)) return { kind: "code" };
  return { kind: "plain" };
}
