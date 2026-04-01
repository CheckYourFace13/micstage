/** Canonical artist dashboard & profile setup (`ArtistProfileForm` on this route). */
export const ARTIST_DASHBOARD_HREF = "/artist" as const;

/**
 * Sanitize `next` / return URLs after auth to same-origin paths only.
 * Prevents open redirects (e.g. //evil.com) and post-login loops via /login, /register, etc.
 */
function isAuthPortalPath(pathOnly: string): boolean {
  return (
    pathOnly.startsWith("/login/") ||
    pathOnly.startsWith("/register/") ||
    pathOnly.startsWith("/reset/") ||
    pathOnly === "/logout"
  );
}

export function safeAfterAuthPath(next: string | null | undefined, fallback: string): string {
  if (next == null) return fallback;
  const raw = String(next).trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("://") || raw.includes("\\")) return fallback;

  const pathOnly = raw.split("?")[0] || "";
  if (!pathOnly.startsWith("/")) return fallback;

  if (isAuthPortalPath(pathOnly)) return fallback;

  return raw;
}

/**
 * After musician login (or “already signed in” on the login page): always land on the artist dashboard
 * unless `next` is a safe deep link back to a venue (e.g. finish booking after sign-in).
 */
export function safeAfterMusicianLoginPath(next: string | null | undefined): string {
  const resolved = safeAfterAuthPath(next, ARTIST_DASHBOARD_HREF);
  const pathOnly = (resolved.split("?")[0] || "").trim();
  if (pathOnly.startsWith("/venues/")) return resolved;
  return ARTIST_DASHBOARD_HREF;
}

/**
 * Path to send the user to login with `next` — avoids nesting ?next= on auth URLs.
 */
export function safeLoginNextPath(pathnameAndSearch: string | null | undefined, fallback: string): string {
  if (pathnameAndSearch == null) return fallback;
  const raw = String(pathnameAndSearch).trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  const pathOnly = raw.split("?")[0] || "";
  if (isAuthPortalPath(pathOnly)) return fallback;
  return raw;
}
