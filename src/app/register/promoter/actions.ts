/**
 * Registration submit route (not a Server Action): avoids Next.js post-action RSC redirect fetch
 * which can log `failed to get redirect response TypeError: fetch failed` on some hosts.
 */
export const PROMOTER_REGISTER_SUBMIT_PATH = "/register/promoter/register-submit" as const;
