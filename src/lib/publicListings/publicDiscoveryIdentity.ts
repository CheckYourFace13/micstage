/**
 * Public discovery identity: collapse duplicate venue/open-mic rows for
 * /locations counts, market hubs, finder, and sitemap inventory.
 *
 * Prefer Google Place ID when present; otherwise a normalized name+city(+region)
 * key. Display slug is intentionally NOT the identity — two slugs can be one place.
 */

export type PublicDiscoveryIdentityInput = {
  googlePlaceId?: string | null;
  name: string;
  city?: string | null;
  region?: string | null;
};

/** Strip legal/chrome tokens and open-mic event fluff so venue cores align. */
export function normalizePublicDiscoveryName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(open[\s-]?mics?|open[\s-]?mikes?|open\s+jam|open\s+stage|jam\s+night|comedy\s+night|poetry\s+night|night|nights|weekly|every)\b/g,
      " ",
    )
    .replace(/\b(the|llc|inc|ltd|co|and|&)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGeoPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable identity key for a public discovery row.
 * - `place:<googlePlaceId>` when a Place ID exists
 * - else `namegeo:<coreName>|<city>|<region>`
 */
export function publicDiscoveryIdentityKey(input: PublicDiscoveryIdentityInput): string {
  const placeId = input.googlePlaceId?.trim();
  if (placeId) return `place:${placeId}`;

  const name = normalizePublicDiscoveryName(input.name);
  const city = normalizeGeoPart(input.city);
  const region = normalizeGeoPart(input.region);
  // Name alone is too weak when city is missing — keep region to reduce cross-market collisions.
  return `namegeo:${name || "_"}|${city}|${region}`;
}

export type PublicDiscoveryDedupeMeta = {
  kind?: "claimed" | "verified" | "unclaimed" | string;
  bookable?: boolean;
  hasSchedule?: boolean;
  /** Higher wins when other signals tie (e.g. fresher updatedAt). */
  rankHint?: number;
};

function preferenceScore(meta: PublicDiscoveryDedupeMeta | undefined): number {
  let score = 0;
  if (meta?.kind === "claimed") score += 400;
  else if (meta?.kind === "verified") score += 200;
  else if (meta?.kind === "unclaimed") score += 50;
  if (meta?.bookable) score += 80;
  if (meta?.hasSchedule) score += 40;
  score += Math.max(0, meta?.rankHint ?? 0);
  return score;
}

/**
 * Keep one row per public discovery identity. Prefer claimed → verified → scheduled → bookable.
 * Stable: first-seen wins ties after score (callers should pass preferred order first).
 */
export function dedupeByPublicDiscoveryIdentity<T>(
  rows: T[],
  getIdentity: (row: T) => PublicDiscoveryIdentityInput,
  getMeta?: (row: T) => PublicDiscoveryDedupeMeta | undefined,
): T[] {
  const winners = new Map<string, { row: T; score: number; index: number }>();
  rows.forEach((row, index) => {
    const key = publicDiscoveryIdentityKey(getIdentity(row));
    if (!key || key === "namegeo:_||" || key === "namegeo:_|_|") {
      // Empty identity — keep as unique by index so we never drop nameless rows silently.
      winners.set(`singleton:${index}`, { row, score: 0, index });
      return;
    }
    const score = preferenceScore(getMeta?.(row));
    const prev = winners.get(key);
    if (!prev || score > prev.score || (score === prev.score && index < prev.index)) {
      winners.set(key, { row, score, index });
    }
  });
  return [...winners.values()]
    .sort((a, b) => a.index - b.index)
    .map((w) => w.row);
}
