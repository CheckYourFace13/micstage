/**
 * Normalize user- or DB-stored URLs for safe use in public <a href> or <img src>.
 * Returns null when empty or clearly unusable (e.g. javascript:).
 */
export function safeExternalHref(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^\/\//.test(t)) return `https:${t}`;
  return `https://${t}`;
}
