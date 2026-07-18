/**
 * Server address policy: HTTPS mandatory over the Internet.
 *
 * The content is end-to-end encrypted, but the device token (Bearer) and the
 * metadata travel in clear over http:// → a MITM steals them and can inject
 * responses. We enforce https://, tolerating http:// only towards a local
 * address (self-hosting LAN without TLS), never towards a public host.
 *
 * Returns an error message, or null if the URL is acceptable.
 */
export function serverUrlError(raw: string): string | null {
  const m = /^(https?):\/\/([^/:?#]+)/i.exec(raw.trim());
  if (!m) return "The address must start with https://.";
  const scheme = m[1].toLowerCase();
  const host = m[2].toLowerCase();
  if (scheme === "https") return null;

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "10.0.2.2" || // host as seen from the Android emulator
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  return isLocal ? null : "Use https:// (http is only allowed on a local network).";
}
