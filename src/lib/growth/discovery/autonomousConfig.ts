import { parseIntEnv } from "@/lib/marketing/emailConfig";

/** Accepts common production truthy forms (not only lowercase `true`). */
function envTruthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function envAutonomousExplicitlyDisabled(): boolean {
  const s = process.env.GROWTH_DISCOVERY_AUTONOMOUS_ENABLED?.trim().toLowerCase();
  return s === "false" || s === "0" || s === "no" || s === "off";
}

/** Master switch for paid / high-volume web discovery (CSE, SerpAPI, crawl, Eventbrite). */
export function growthDiscoveryAutonomousEnabled(): boolean {
  return envTruthy(process.env.GROWTH_DISCOVERY_AUTONOMOUS_ENABLED);
}

/** Google CSE or SerpAPI search calls per adapter per cron invocation (each returns up to ~10 organic links). */
export function growthDiscoveryAutonomousSearchCallsPerRun(): number {
  return parseIntEnv("GROWTH_DISCOVERY_AUTONOMOUS_SEARCH_CALLS_PER_RUN", 6);
}

/** HTML page fetches (for email / social extraction) per autonomous search adapter per run. */
export function growthDiscoveryAutonomousMaxPageFetchesPerRun(): number {
  return parseIntEnv("GROWTH_DISCOVERY_AUTONOMOUS_PAGE_FETCHES_PER_RUN", 35);
}

/** Delay between outbound HTTP requests during discovery (politeness + rate limits). */
export function growthDiscoveryHttpDelayMs(): number {
  return parseIntEnv("GROWTH_DISCOVERY_HTTP_DELAY_MS", 150);
}

export function hasGoogleProgrammableSearch(): boolean {
  return Boolean(process.env.GROWTH_GOOGLE_CSE_API_KEY?.trim() && process.env.GROWTH_GOOGLE_CSE_CX?.trim());
}

/**
 * SerpAPI key: prefer MicStage-prefixed env, then names SerpAPI/snippets often use (no new vars required).
 * `hasSerpApi` and `runSerpApiSearch` must use the same resolution.
 */
export function serpApiKeyForDiscovery(): string {
  return (
    process.env.GROWTH_SERPAPI_KEY?.trim() ||
    process.env.GROWTH_SERPAPI_API_KEY?.trim() ||
    process.env.SERPAPI_KEY?.trim() ||
    process.env.SERPAPI_API_KEY?.trim() ||
    ""
  );
}

export function serpApiKeySourceForDiscovery():
  | "GROWTH_SERPAPI_KEY"
  | "GROWTH_SERPAPI_API_KEY"
  | "SERPAPI_KEY"
  | "SERPAPI_API_KEY"
  | null {
  if (process.env.GROWTH_SERPAPI_KEY?.trim()) return "GROWTH_SERPAPI_KEY";
  if (process.env.GROWTH_SERPAPI_API_KEY?.trim()) return "GROWTH_SERPAPI_API_KEY";
  if (process.env.SERPAPI_KEY?.trim()) return "SERPAPI_KEY";
  if (process.env.SERPAPI_API_KEY?.trim()) return "SERPAPI_API_KEY";
  return null;
}

export function hasSerpApi(): boolean {
  return Boolean(serpApiKeyForDiscovery());
}

/**
 * Venue-only SerpAPI/CSE web search: also allowed when search keys are configured and the master switch is
 * not explicitly off. Curated adapters ignore `GROWTH_DISCOVERY_AUTONOMOUS_ENABLED`; operators often set SerpAPI
 * but omit the flag, which previously zeroed this adapter while curated seeds still ran.
 * Eventbrite and seed crawl still require {@link growthDiscoveryAutonomousEnabled} only.
 */
export function growthDiscoveryAutonomousWebSearchEnabled(): boolean {
  if (growthDiscoveryAutonomousEnabled()) return true;
  if (envAutonomousExplicitlyDisabled()) return false;
  return hasSerpApi() || hasGoogleProgrammableSearch();
}

/** Comma-separated root URLs to fetch and mine for contacts (same-host links optional). */
export function growthDiscoveryCrawlSeedUrls(): string[] {
  const raw = process.env.GROWTH_DISCOVERY_CRAWL_SEED_URLS?.trim();
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function growthDiscoveryCrawlMaxSeedsPerRun(): number {
  return parseIntEnv("GROWTH_DISCOVERY_CRAWL_MAX_SEEDS_PER_RUN", 12);
}

export function hasEventbriteToken(): boolean {
  return Boolean(process.env.GROWTH_EVENTBRITE_TOKEN?.trim() || process.env.EVENTBRITE_PRIVATE_TOKEN?.trim());
}

export function growthEventbriteToken(): string {
  return (
    process.env.GROWTH_EVENTBRITE_TOKEN?.trim() || process.env.EVENTBRITE_PRIVATE_TOKEN?.trim() || ""
  );
}
