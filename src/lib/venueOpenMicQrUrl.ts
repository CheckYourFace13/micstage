/** Same pattern as `PUBLIC_SLUG_RE` in `locationSlugValidation` — kept local so client components avoid importing DB code. */
const VENUE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG_LEN = 120;

/**
 * Canonical path for a venue’s public MicStage hub (schedule, lineup entry, booking).
 * QR codes and share UX should use `absoluteUrl(venueOpenMicPublicPath(slug))`.
 */
export function venueOpenMicPublicPath(slug: string): string {
  return `/venues/${slug}`;
}

/** True when `url` is an absolute URL whose path is exactly `/venues/<valid-slug>` with no query or hash. */
export function isCanonicalVenueOpenMicPublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password || u.hash) return false;
    if (u.search && u.search !== "") return false;
    const path = u.pathname.replace(/\/$/, "") || "/";
    const m = /^\/venues\/(.+)$/.exec(path);
    if (!m) return false;
    const slug = m[1];
    return slug.length > 0 && slug.length <= MAX_SLUG_LEN && VENUE_SLUG_RE.test(slug);
  } catch {
    return false;
  }
}
