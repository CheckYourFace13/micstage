/**
 * Best-effort extraction of publicly visible venue staff / decision-maker labels from page text.
 * No login-gated content — HTML body and chrome only.
 */

export type PublicVenueRoleHint = {
  role: string;
  nameOrLabel?: string;
};

const ROLE_NORMALIZE: Record<string, string> = {
  owner: "owner",
  "co-owner": "owner",
  coowner: "owner",
  manager: "manager",
  "general manager": "general_manager",
  "events manager": "events_manager",
  "event manager": "events_manager",
  "event coordinator": "event_coordinator",
  "events coordinator": "event_coordinator",
  "booking manager": "booking_manager",
  booking: "booking_manager",
  "talent buyer": "talent_buyer",
};

function normRole(s: string): string {
  const k = s.trim().toLowerCase().replace(/\s+/g, " ");
  return ROLE_NORMALIZE[k] ?? k.replace(/\s+/g, "_");
}

const RE_ROLE_THEN_NAME =
  /\b(owner|co-?owner|general manager|events manager|event manager|event coordinator|booking manager|talent buyer|manager)\s*[:#\-–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi;

const RE_NAME_THEN_ROLE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*,\s*(owner|co-?owner|general manager|events manager|event manager|event coordinator|booking manager|talent buyer|manager)\b/gi;

/**
 * Pull "Role: Name" / "Name, Role" style snippets from visible text (merged crawl sample).
 */
export function extractPublicVenueRoleHints(text: string, max = 14): PublicVenueRoleHint[] {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 48_000);
  if (t.length < 12) return [];

  const out: PublicVenueRoleHint[] = [];
  const seen = new Set<string>();

  for (const m of t.matchAll(RE_ROLE_THEN_NAME)) {
    if (out.length >= max) break;
    const role = normRole(m[1]!);
    const name = m[2]!.trim();
    if (name.length < 2 || name.length > 48) continue;
    const key = `${role}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, nameOrLabel: name });
  }

  for (const m of t.matchAll(RE_NAME_THEN_ROLE)) {
    if (out.length >= max) break;
    const name = m[1]!.trim();
    const role = normRole(m[2]!);
    if (name.length < 2 || name.length > 48) continue;
    const key = `${role}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, nameOrLabel: name });
  }

  return out;
}
