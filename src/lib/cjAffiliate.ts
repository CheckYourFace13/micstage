/**
 * MicStage-only CJ link. The click path is the promotional property 101904046.
 * Do not copy a click URL from another website.
 */

const MICSTAGE_PID = "101904046";

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

/** AliExpress homepage text link returned by CJ Link Search for this property. */
const ALIEXPRESS_GEAR_CLICK_URL =
  "https://www.dpbolvw.net/click-101904046-17242061-1773390959000";

const GEAR_KEYWORDS = [
  "microphone",
  "mic stand",
  "portable pa",
  "powered speaker",
  "audio mixer",
  "xlr",
];

function validMicstageClick(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!CJ_HOSTS.has(host)) return false;
  if (!url.pathname.includes("/click-") && !url.pathname.includes("/links/")) return false;
  if (!url.pathname.includes(MICSTAGE_PID)) return false;
  if (url.pathname.includes("101802777")) return false;
  return true;
}

/** One optional general-store link for a gear page. Null unless the page is about stage equipment. */
export function micstageGearStoreLink(text: string): string | null {
  const haystack = text.toLowerCase();
  if (!GEAR_KEYWORDS.some((keyword) => haystack.includes(keyword))) return null;
  return validMicstageClick(ALIEXPRESS_GEAR_CLICK_URL) ? ALIEXPRESS_GEAR_CLICK_URL : null;
}
