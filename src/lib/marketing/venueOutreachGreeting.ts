/**
 * Cold venue outreach salutation: avoid scraped SERP/event titles ("Open Mic Nights", etc.).
 */

const GENERIC_EMAIL_LOCALS = new Set(
  [
    "info",
    "contact",
    "booking",
    "bookings",
    "hello",
    "hi",
    "events",
    "mail",
    "email",
    "admin",
    "team",
    "support",
    "sales",
    "help",
    "office",
    "inquiries",
    "inquiry",
    "general",
    "noreply",
    "no-reply",
    "donotreply",
    "marketing",
    "promo",
    "newsletter",
    "venue",
    "music",
    "bar",
    "restaurant",
    "cafe",
    "the",
    "owner",
    "manager",
  ].map((s) => s.toLowerCase()),
);

/** Titles / SERP snippets that should never be used as "Hi {name}," */
const SCRAPED_VENUE_LABEL = [
  /^open mics?$/i,
  /^open mic nights?$/i,
  /^weekly open mic/i,
  /^open mic\b/i,
  /\bopen mic nights?\b/i,
  /^discovered prospect$/i,
  /^live music$/i,
  /^events?$/i,
  /^contact us$/i,
  /^home$/i,
];

function titleCaseName(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Plausible given name from mailbox local part only when it looks like a person name (not info@, bookings@, etc.).
 */
export function firstNameFromContactEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (!local) return null;
  const noPlus = local.split("+")[0] ?? local;
  const firstToken = noPlus.split(/[._-]/)[0]?.trim() ?? "";
  if (!firstToken || firstToken.length < 2 || firstToken.length > 15) return null;
  if (!/^[a-z]+$/i.test(firstToken)) return null;
  if (GENERIC_EMAIL_LOCALS.has(firstToken.toLowerCase())) return null;
  return titleCaseName(firstToken);
}

export function isScrapedGenericVenueLabel(name: string | null | undefined): boolean {
  const n = name?.replace(/\s+/g, " ").trim() ?? "";
  if (n.length < 2) return true;
  if (n.length > 56) return true;
  const lower = n.toLowerCase();
  for (const re of SCRAPED_VENUE_LABEL) {
    if (re.test(n) || re.test(lower)) return true;
  }
  return false;
}

/**
 * True when `name` is safe to use after "Hi" in outreach (real venue / business name).
 */
export function isCleanVenueNameForGreeting(name: string | null | undefined): boolean {
  const n = name?.replace(/\s+/g, " ").trim() ?? "";
  if (n.length < 2 || n.length > 56) return false;
  if (isScrapedGenericVenueLabel(n)) return false;
  if (/[|•]/.test(n)) return false;
  if (/\s[-\u2013\u2014]\s/.test(n)) return false;
  return true;
}

export type VenueOutreachSalutationParts =
  | { kind: "neutral" }
  | { kind: "hi"; label: string }; /** label is unescaped; caller wraps in Hi …, */

/**
 * Prefer contact first name (from email local), then clean venue name, then neutral "Hey there".
 */
export function resolveVenueOutreachSalutationParts(
  venueName: string,
  contactEmail: string | null | undefined,
): VenueOutreachSalutationParts {
  const first = firstNameFromContactEmail(contactEmail);
  if (first) return { kind: "hi", label: first };
  if (isCleanVenueNameForGreeting(venueName)) {
    return { kind: "hi", label: venueName.replace(/\s+/g, " ").trim() };
  }
  return { kind: "neutral" };
}
