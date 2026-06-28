/** Scraped or generic listing names that should not appear in public discovery. */
const JUNK_NAME =
  /\b(karaoke|trivia|best bars|nightlife guide|review:|must-chicago|bandmix|pub trivia|private events|how to mic|blog|list of all|top ten live|live music trail|comedy clubs shows in)\b/i;

const GENERIC_ARTIFACT =
  /^(write|events|stand|home|local events|event venue|open mic night|open mic|home-\d+)$/i;

export function isPublicListingNameOk(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 4) return false;
  if (GENERIC_ARTIFACT.test(n)) return false;
  if (JUNK_NAME.test(n)) return false;
  return true;
}

/** Whether a listing page should be indexed (has substance beyond a bare scraped title). */
export function listingIsPubliclyIndexable(listing: {
  name: string;
  verificationStatus: string;
  formattedAddress: string;
  city: string | null;
  schedules: unknown[];
  lastVerifiedAt: Date | null;
}): boolean {
  if (listing.verificationStatus === "OUTDATED" || listing.verificationStatus === "UNVERIFIED") {
    return false;
  }
  if (!isPublicListingNameOk(listing.name)) return false;
  const hasLocation = Boolean(listing.formattedAddress?.trim() || listing.city?.trim());
  if (!hasLocation) return false;
  return listing.schedules.length > 0 || listing.lastVerifiedAt != null;
}
