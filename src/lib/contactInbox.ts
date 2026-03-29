/**
 * Server-only destination for /contact form submissions (never render in HTML).
 * Prefer MICSTAGE_CONTACT_INBOX; CONTACT_INBOX and NEXT_PUBLIC_CONTACT_EMAIL are fallbacks for legacy deploys.
 */
export function getContactInboxForServer(): string | null {
  const a = process.env.MICSTAGE_CONTACT_INBOX?.trim();
  if (a) return a;
  const b = process.env.CONTACT_INBOX?.trim();
  if (b) return b;
  const c = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (c) return c;
  return null;
}
