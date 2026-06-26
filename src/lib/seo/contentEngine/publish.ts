import { SCHEDULED_RESOURCE_ARTICLES } from "@/lib/seo/contentEngine/scheduledArticles";
import type { ResourceArticle } from "@/lib/resources/articleTypes";

export function startOfUtcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Scheduled queue articles whose `publishedAt` is today or earlier (UTC). */
export function getPublishedScheduledArticles(now = new Date()): ResourceArticle[] {
  const today = startOfUtcDateString(now);
  return SCHEDULED_RESOURCE_ARTICLES.filter((a) => a.publishedAt <= today);
}

/** Articles whose publish date is exactly today UTC — for IndexNow ping after go-live. */
export function getNewlyPublishedResourceArticles(now = new Date()): ResourceArticle[] {
  const today = startOfUtcDateString(now);
  return SCHEDULED_RESOURCE_ARTICLES.filter((a) => a.publishedAt === today);
}
