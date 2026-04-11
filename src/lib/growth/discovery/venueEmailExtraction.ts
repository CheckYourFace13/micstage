/**
 * Pick best venue outreach mailbox from noisy discovery extracts (visible text, mailto, deep pages).
 * Prefer role-based locals on the venue domain; deprioritize noreply/newsletter hosts.
 */

import { growthLeadEmailEligibleForAutoOutreach, parseGrowthLeadEmailInput } from "@/lib/growth/leadEmailValidation";

function localPart(mailbox: string): string {
  const i = mailbox.indexOf("@");
  return (i >= 0 ? mailbox.slice(0, i) : mailbox).toLowerCase().trim();
}

function hostOfEmail(mailbox: string): string | null {
  const i = mailbox.lastIndexOf("@");
  if (i < 0) return null;
  return mailbox.slice(i + 1).toLowerCase().trim().replace(/^www\./, "") || null;
}

const DEPRIORITIZE_LOCAL = /^(no-?reply|donotreply|mailer-daemon|bounce|newsletter|marketing|promo|notifications?|support\+|abuse|privacy)$/i;

const ROLE_SCORES: { re: RegExp; score: number }[] = [
  { re: /^(bookings?|booking|events?|shows?|talent|music|entertainment|performers?|gigs?|private[\w-]*events?)$/i, score: 110 },
  { re: /^(manager|mgmt|booking\.agent)$/i, score: 105 },
  { re: /^(info|hello|contact|inquir|enquir|office|general|frontdesk|host|venue)$/i, score: 88 },
  { re: /^(press|media|team|staff)$/i, score: 72 },
];

export type EmailWithSource = {
  email: string;
  source: "mailto" | "body" | "header_footer" | "secondary_page";
};

function scoreMailbox(email: string, pageHost: string | null, source: string): number {
  const low = email.toLowerCase().trim();
  const local = localPart(low);
  let s = 40;
  const eh = hostOfEmail(low);
  if (pageHost && eh) {
    if (eh === pageHost || eh.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${eh}`)) s += 45;
    else if (pageHost.replace(/^www\./, "").endsWith(eh)) s += 40;
  }
  if (DEPRIORITIZE_LOCAL.test(local)) s -= 120;
  if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(low)) s -= 200;
  for (const { re, score } of ROLE_SCORES) {
    if (re.test(local)) s = Math.max(s, score);
  }
  if (source === "mailto") s += 12;
  if (source === "header_footer") s += 10;
  if (source === "secondary_page") s += 6;
  if (source === "body") s += 2;
  return s;
}

/**
 * Returns normalized best primary and additional (deduped, cap additional list).
 */
export function pickPrimaryVenueOutreachEmail(
  tagged: EmailWithSource[],
  pageHost: string | null,
): { primary: string | null; additional: string[]; bestSource: string } {
  const uniq = new Map<string, { email: string; source: string; score: number }>();
  for (const { email, source } of tagged) {
    const parsed = parseGrowthLeadEmailInput(email, { extractedFromNoisyText: true });
    if (parsed.kind !== "valid" || !growthLeadEmailEligibleForAutoOutreach(parsed)) continue;
    const n = parsed.normalized;
    if (n.length > 90) continue;
    const sc = scoreMailbox(n, pageHost, source);
    const prev = uniq.get(n);
    if (!prev || sc > prev.score) uniq.set(n, { email: n, source, score: sc });
  }
  const list = [...uniq.values()].sort((a, b) => b.score - a.score);
  if (!list.length) return { primary: null, additional: [], bestSource: "none" };
  const primary = list[0]!.email;
  const additional = list
    .slice(1, 12)
    .map((x) => x.email)
    .filter((e) => e !== primary);
  return { primary, additional, bestSource: list[0]!.source };
}
