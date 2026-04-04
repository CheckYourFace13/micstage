import type { MetadataRoute } from "next";

/**
 * Extra sitemap URLs for marketing surfaces (campaign landers, etc.).
 * Phase 1: empty — product sitemap remains source of truth for discovery URLs.
 */
export function marketingSitemapSupplements(): MetadataRoute.Sitemap {
  return [];
}

/**
 * Extra `disallow` paths for `robots.ts` (preview hosts, draft campaigns).
 * Phase 1: empty.
 */
export function marketingRobotsDisallowExtra(): string[] {
  return [];
}
