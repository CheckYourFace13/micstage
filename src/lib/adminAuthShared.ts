/** Edge + Node shared helpers for MicStage internal admin (no crypto). */

export function parseAdminEmailAllowlist(): string[] {
  const raw = process.env.MICSTAGE_ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  const list = parseAdminEmailAllowlist();
  if (list.length === 0) return true;
  if (!email || !email.trim()) return false;
  return list.includes(email.trim().toLowerCase());
}
