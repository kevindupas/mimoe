/** Concatène des classes conditionnelles (falsy ignoré). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
