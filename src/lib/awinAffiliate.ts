/** Awin affiliate configuration for MicStage editorial resource pages. */

export const AWIN_AFFILIATE_NETWORK = "awin" as const;
export const AWIN_MUSIC_STAND_ADVERTISER = "the_music_stand" as const;
export const AWIN_MUSIC_STAND_DESTINATION = "best_sellers" as const;

/**
 * Approved The Music Stand best-sellers deep link via Awin.
 * Keep this URL stable; do not invent alternate creatives or banners.
 */
export const AWIN_MUSIC_STAND_BEST_SELLERS_URL =
  "https://www.awin1.com/cread.php?awinmid=90327&awinaffid=3112962&ued=https%3A%2F%2Fthemusicstand.com%2Fcollections%2Fbest-sellers";
