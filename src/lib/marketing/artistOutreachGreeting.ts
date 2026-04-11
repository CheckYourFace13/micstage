/**
 * Artist cold outreach salutation: prefer real first name from email, else clean display name.
 */

import { firstNameFromContactEmail } from "@/lib/marketing/venueOutreachGreeting";

const GENERIC_DISPLAY = new Set(
  [
    "unknown",
    "n/a",
    "na",
    "artist",
    "musician",
    "performer",
    "singer",
    "comedian",
    "poet",
    "test",
    "demo",
    "tbd",
    "various artists",
    "discovered prospect",
    "open mic",
    "open mics",
  ].map((s) => s.toLowerCase()),
);

export function isCleanArtistDisplayNameForGreeting(name: string | null | undefined): boolean {
  const n = name?.replace(/\s+/g, " ").trim() ?? "";
  if (n.length < 2 || n.length > 56) return false;
  if (GENERIC_DISPLAY.has(n.toLowerCase())) return false;
  if (/^https?:\/\//i.test(n)) return false;
  if (/[|•]/.test(n)) return false;
  if (/\s[-\u2013\u2014]\s/.test(n)) return false;
  if (!/[a-zA-Z]/.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (/^(the|a|an)\s+open\s+mic/i.test(n)) return false;
  if (/^open\s+mic\b/i.test(n)) return false;
  return true;
}

export type ArtistOutreachSalutationParts =
  | { kind: "neutral" }
  | { kind: "hi"; label: string };

/**
 * Prefer mailbox first name, then clean profile/display name, then neutral "Hey there".
 */
export function resolveArtistOutreachSalutationParts(
  displayName: string,
  contactEmail: string | null | undefined,
): ArtistOutreachSalutationParts {
  const first = firstNameFromContactEmail(contactEmail);
  if (first) return { kind: "hi", label: first };
  if (isCleanArtistDisplayNameForGreeting(displayName)) {
    return { kind: "hi", label: displayName.replace(/\s+/g, " ").trim() };
  }
  return { kind: "neutral" };
}
