import { parseIntEnv } from "@/lib/marketing/emailConfig";

/** Master switch for paid / high-volume web discovery (CSE, SerpAPI, crawl, Eventbrite). */
export function growthDiscoveryAutonomousEnabled(): boolean {
  return process.env.GROWTH_DISCOVERY_AUTONOMOUS_ENABLED === "true";
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

export function hasSerpApi(): boolean {
  return Boolean(process.env.GROWTH_SERPAPI_KEY?.trim());
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
