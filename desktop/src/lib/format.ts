/** Short relative time. */
export function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export const MAX_CARD_TEXT = 200;

/** Truncates a card's text for the preview. */
export function preview(text: string): string {
  return text.length > MAX_CARD_TEXT ? text.slice(0, MAX_CARD_TEXT) + "…" : text;
}

/** File name extension (uppercase), or "" if none. */
export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toUpperCase() : "";
}
