/** Lowercase + trim for dedupe / suppression keys (not full RFC validation). */
export function normalizeMarketingEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
