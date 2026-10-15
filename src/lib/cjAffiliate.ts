/**
 * MicStage CJ Affiliate helpers.
 *
 * Portfolio CJ account CID 7990498; MicStage promotional property PID 101904046.
 * Click paths must carry this PID only — never copy a click URL from DrinkKnird,
 * LeaguePour, or another sibling site (e.g. 101904023 / 101802777).
 *
 * Credentials (CJ personal access token) stay server-side / local config for
 * Link Search scripts. Do not embed tokens in the app or client bundle.
 *
 * Strongly relevant merchants for MicStage: music gear / mics / instruments / PA.
 * Heil Sound (7036312) is relevant but was relationship=notjoined as of the last
 * Link Search check — no clickUrl until joined. General marketplaces are joined
 * on this property but are not a music-specialty fit; do not promote them here.
 */

export const MICSTAGE_CJ_PID = "101904046";

const CJ_HOSTS = new Set([
  "anrdoezrs.net",
  "dpbolvw.net",
  "jdoqocy.com",
  "tkqlhce.com",
  "kqzyfj.com",
  "emjcd.com",
  "qksrv.net",
  "afcyhf.com",
  "ftjcfx.com",
  "lduhtrp.net",
  "tqlkg.com",
  "awltovhc.com",
]);

const FOREIGN_PIDS = ["101802777", "101904023", "101904040", "101904044"] as const;

/** True when URL is a CJ click/links path for the MicStage PID only. */
export function isValidMicstageCjClick(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!CJ_HOSTS.has(host)) return false;
  if (!url.pathname.includes("/click-") && !url.pathname.includes("/links/")) return false;
  if (!url.pathname.includes(MICSTAGE_CJ_PID)) return false;
  if (FOREIGN_PIDS.some((pid) => url.pathname.includes(pid))) return false;
  return true;
}

/**
 * Reserved for a future music-specialty CJ text link (e.g. Heil Sound once joined).
 * Returns null until a MicStage-PID click URL is explicitly approved in code.
 */
export function micstageMusicGearCjLink(): string | null {
  return null;
}
