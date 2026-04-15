/**
 * Registration submit route (not a Server Action): avoids Next.js post-action RSC redirect fetch
 * which can log `failed to get redirect response TypeError: fetch failed` on some hosts.
 */
export const VENUE_REGISTER_SUBMIT_PATH = "/register/venue/register-submit" as const;

