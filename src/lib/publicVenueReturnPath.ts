/**
 * Safe redirect target after public booking actions. Prevents open redirects:
 * only same-venue paths under `/venues/:slug` are allowed.
 */
export function safePublicVenueReturnPath(venueSlug: string, raw: string | undefined): string {
  const fallback = `/venues/${venueSlug}`;
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/")) return fallback;
  if (!t.startsWith(`/venues/${venueSlug}`)) return fallback;
  if (t.startsWith("//") || t.includes("://")) return fallback;
  if (t.length > 512) return fallback;
  return t;
}

export function appendQueryToPath(path: string, extra: Record<string, string>): string {
  const qIndex = path.indexOf("?");
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const existing = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  const sp = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(extra)) {
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
