/**
 * Basic SSRF guard for server-side fetches to user-supplied origins (website import, etc.).
 */
export function assertImportableHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "0.0.0.0" ||
    /^127\.\d+\.\d+\.\d+$/.test(h) ||
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h) ||
    /^169\.254\.\d+\.\d+$/.test(h) ||
    h === "[::1]" ||
    h.startsWith("fc00:") ||
    h.startsWith("fd")
  ) {
    throw new Error("private_host");
  }
  return u;
}
