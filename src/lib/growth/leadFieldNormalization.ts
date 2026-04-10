/** Lowercase hostname without www; null if not parseable. */
export function normalizeWebsiteHost(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/** Instagram handle lowercase without @; null if not found in URL or string. */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t.replace(/^@/, "")}`);
    const path = u.pathname.replace(/\/+$/, "");
    const m = /^\/([A-Za-z0-9._]+)\/?$/.exec(path);
    if (m && !["p", "reel", "stories", "explore"].includes(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  } catch {
    /* fall through */
  }
  const at = t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  const h = at.replace(/^@/, "").trim().toLowerCase();
  return /^[a-z0-9._]+$/.test(h) ? h : null;
}

export function normalizeNameCityKey(name: string | null | undefined, city: string | null | undefined): string {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const c = (city ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}|${c}`;
}

export function normalizeNameSuburbKey(name: string | null | undefined, suburb: string | null | undefined): string {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const s = (suburb ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${n}|${s}`;
}

/** Canonical Facebook profile URL for dedupe (no query string, lowercase host/path). */
export function normalizeFacebookUrlForDedupe(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    if (!/facebook\.com|fb\.com/i.test(u.hostname)) return null;
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "").toLowerCase() || "/";
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}
