import type { GrowthLeadContactQuality, GrowthLeadEmailConfidence } from "@/generated/prisma/client";
import { pathKindForUrl } from "@/lib/growth/growthLeadContactAutomation";

export type GrowthLeadPipelineBadge =
  | "email_ready"
  | "email_review"
  | "contact_path"
  | "social_calendar"
  | "website_only"
  | "unknown";

const PATH_KIND_LABEL: Record<string, string> = {
  CONTACT_PAGE: "Contact page",
  BOOKING_PAGE: "Booking / inquiry",
  EVENT_PAGE: "Events / calendar",
  SOCIAL_PATH: "Social",
  WEBSITE_PATH: "Website",
};

function socialLabelFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (/instagram\.com/.test(lower)) return "Instagram";
  if (/facebook\.com|fb\.com|m\.facebook\.com/.test(lower)) return "Facebook";
  if (/tiktok\.com/.test(lower)) return "TikTok";
  if (/youtube\.com|youtu\.be/.test(lower)) return "YouTube";
  return null;
}

/**
 * Human-readable non-email outreach paths for admin queues.
 * Contact-form auto-submit is not implemented; paths are stored and optionally enqueued as MarketingJob payloads.
 */
export function describeGrowthLeadContactPaths(input: {
  contactUrl: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };

  const ordered = [
    input.contactUrl,
    input.websiteUrl,
    input.instagramUrl,
    input.facebookUrl,
    input.youtubeUrl,
    input.tiktokUrl,
  ].filter(Boolean) as string[];

  for (const url of ordered) {
    const social = socialLabelFromUrl(url);
    if (social) {
      push(social);
      continue;
    }
    const kind = pathKindForUrl(url);
    if (kind === "CONTACT_PAGE") push("Contact page");
    else if (kind === "BOOKING_PAGE") push("Booking / inquiry page");
    else if (kind === "EVENT_PAGE") push("Events / calendar");
    else push(PATH_KIND_LABEL[kind] ?? "Website URL");
  }

  return out;
}

export function growthLeadPipelineBadge(input: {
  contactQuality: GrowthLeadContactQuality | null;
  contactEmailNormalized: string | null;
  contactEmailConfidence: GrowthLeadEmailConfidence | null;
}): { badge: GrowthLeadPipelineBadge; label: string } {
  const q = input.contactQuality;
  const email = Boolean(input.contactEmailNormalized?.trim());
  const conf = input.contactEmailConfidence;

  if (email && (conf === "HIGH" || conf === "MEDIUM")) {
    return { badge: "email_ready", label: "Email-ready" };
  }
  if (email && conf === "LOW") {
    return { badge: "email_review", label: "Email (low confidence)" };
  }
  if (q === "EMAIL" && email) {
    return { badge: "email_review", label: "Email (review)" };
  }
  if (q === "CONTACT_PAGE") {
    return { badge: "contact_path", label: "Contact-path queue" };
  }
  if (q === "SOCIAL_OR_CALENDAR") {
    return { badge: "social_calendar", label: "Social / calendar queue" };
  }
  if (q === "WEBSITE_ONLY") {
    return { badge: "website_only", label: "Website only" };
  }
  return { badge: "unknown", label: "—" };
}
