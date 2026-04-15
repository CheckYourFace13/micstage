/**
 * Login submit route (not a Server Action): avoids Next.js post-action RSC redirect fetch
 * which can log `failed to get redirect response TypeError: fetch failed` on some hosts.
 */
export const MUSICIAN_LOGIN_SUBMIT_PATH = "/login/musician/login-submit" as const;
