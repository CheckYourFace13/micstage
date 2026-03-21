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
