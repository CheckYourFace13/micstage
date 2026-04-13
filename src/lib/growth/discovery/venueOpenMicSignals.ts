import type { GrowthLeadOpenMicSignalTier, GrowthLeadPerformanceTag } from "@/generated/prisma/client";

const EXPLICIT_PATTERNS: RegExp[] = [
  /\bopen\s*mic\b/i,
  /\bopen\s*mic\s*night\b/i,
  /\bmic\s*night\b/i,
  /\bacoustic\s*open\s*mic\b/i,
  /\bcomedy\s*open\s*mic\b/i,
  /\bpoetry\s*open\s*mic\b/i,
  /\bjam\s*night\b/i,
  /\bsinger[\s-]*songwriter\s*night\b/i,
  /\bamateur\s*night\b/i,
  /\bshowcase\s*night\b/i,
  /\bopen\s*stage\b/i,
];

const STRONG_PATTERNS: RegExp[] = [
  /\brecurring\s+(event|show|night)s?\b/i,
  /\bevents?\s*calendar\b/i,
  /\bweekly\s+(show|night|music|comedy|trivia|karaoke)\b/i,
  /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bcomedy\s+(night|show|every)\b/i,
  /\btrivia\s+night\b/i,
  /\bkaraoke\s+night\b/i,
  /\bsinger[\s-]*songwriter\s+(night|showcase|open)\b/i,
  /\bjam\s+session\b/i,
  /\blive\s+music\b/i,
  /\bstand[\s-]*up\b/i,
  /\bcomedy\s+(club|night|show)\b/i,
  /\bpoetry\s+(slam|reading|night)\b/i,
  /\bacoustic\s+(night|set|show)\b/i,
  /\bbooking\b.*\b(contact|email|form)\b/i,
  /\b(book|hire)\s+(a\s+)?(band|performer|entertainer)\b/i,
  /\bprivate\s+event(s)?\b/i,
  /\bstage\b/i,
  /\bperformance(s)?\b/i,
  /\bentertainment\b/i,
];

const VENUE_CONTEXT_PATTERNS: RegExp[] = [
  /\b(coffee\s*house|coffeehouse|café|cafe|brewery|brewpub|taproom|bar\s*&\s*grill|sports\s*bar|wine\s*bar)\b/i,
  /\b(comedy\s*club|music\s*venue|listening\s*room|performing\s*arts)\b/i,
  /\b(restaurant|lounge|nightclub|theater|theatre)\b/i,
];

const TAG_COMEDY = /\b(comedy|standup|stand[\s-]up)\b/i;
const TAG_POETRY = /\b(poetry|spoken\s*word|slam)\b/i;
const TAG_MUSIC = /\b(music|acoustic|jazz|blues|folk|open\s*mic)\b/i;

export type OpenMicVenueScoreResult = {
  tier: GrowthLeadOpenMicSignalTier;
  /** 0–100 discovery confidence. */
  confidence: number;
  /** 1–10 fit heuristic for sorting / auto-draft. */
  fitScore: number;
  /** False = skip creating this candidate (no supporting signal + no contact path). */
  shouldIngest: boolean;
  performanceTags: GrowthLeadPerformanceTag[];
};

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function uniqueTags(tags: GrowthLeadPerformanceTag[]): GrowthLeadPerformanceTag[] {
  return [...new Set(tags)];
}

/**
 * Scores a venue hit from search snippet + page text + optional search query (already open-mic oriented).
 */
export function scoreOpenMicVenueProspect(input: {
  snippet: string;
  pageTextSample: string;
  title: string;
  searchQuery: string;
  hasEmail: boolean;
  hasContactPath: boolean;
  hasSocial: boolean;
}): OpenMicVenueScoreResult {
  const bundle = `${input.searchQuery}\n${input.title}\n${input.snippet}\n${input.pageTextSample}`.slice(0, 120_000);
  const lower = bundle.toLowerCase();

  const explicit = hasAny(lower, EXPLICIT_PATTERNS);
  const strong = hasAny(lower, STRONG_PATTERNS);
  const venueCtx = hasAny(lower, VENUE_CONTEXT_PATTERNS);

  let tier: GrowthLeadOpenMicSignalTier;
  if (explicit) tier = "EXPLICIT_OPEN_MIC";
  else if (strong && venueCtx) tier = "STRONG_LIVE_EVENT";
  else if (strong || venueCtx) tier = "STRONG_LIVE_EVENT";
  else tier = "WEAK_INFERRED";

  const tags: GrowthLeadPerformanceTag[] = [];
  if (TAG_COMEDY.test(lower)) tags.push("COMEDY");
  if (TAG_POETRY.test(lower)) tags.push("POETRY");
  if (TAG_MUSIC.test(lower)) tags.push("MUSIC");
  if (!tags.length && explicit) tags.push("VARIETY");

  let confidence = 28;
  if (explicit) confidence += 42;
  if (strong) confidence += 18;
  if (venueCtx) confidence += 12;
  if (input.hasEmail) confidence += 10;
  else if (input.hasContactPath) confidence += 8;
  else if (input.hasSocial) confidence += 5;
  confidence = Math.min(100, Math.max(0, confidence));

  let fitScore = 4;
  if (explicit) fitScore += 3;
  if (strong) fitScore += 2;
  if (venueCtx) fitScore += 1;
  if (input.hasEmail) fitScore += 2;
  else if (input.hasContactPath) fitScore += 1;
  else if (input.hasSocial) fitScore += 1;
  fitScore = Math.min(10, Math.max(1, fitScore));

  const hasPath = input.hasEmail || input.hasContactPath || input.hasSocial;
  const shouldIngest =
    tier === "EXPLICIT_OPEN_MIC" ||
    tier === "STRONG_LIVE_EVENT" ||
    (tier === "WEAK_INFERRED" && hasPath);

  return {
    tier,
    confidence,
    fitScore,
    shouldIngest,
    performanceTags: uniqueTags(tags),
  };
}
