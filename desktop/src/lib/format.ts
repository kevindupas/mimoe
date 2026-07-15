/** Temps relatif court en français. */
export function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

export const MAX_CARD_TEXT = 200;

/** Tronque le texte d'une card pour l'aperçu. */
export function preview(text: string): string {
  return text.length > MAX_CARD_TEXT ? text.slice(0, MAX_CARD_TEXT) + "…" : text;
}
