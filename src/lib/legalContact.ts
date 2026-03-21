/** Public-facing contact for legal pages and footer (set NEXT_PUBLIC_CONTACT_EMAIL in production). */
export function legalContactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "support@micstage.com";
}
