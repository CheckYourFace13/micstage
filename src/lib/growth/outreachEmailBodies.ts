import type { GrowthLeadType } from "@/generated/prisma/client";
import type { MarketingEmailPayload } from "@/lib/marketing/emailPayloads";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function discoveryPhrase(slug: string | null, city: string | null): string | null {
  if (slug) return slug.replace(/-/g, " ");
  if (city) return city;
  return null;
}

/** Draft outreach bodies for imported / manual growth leads (not venue-claim cold). */
export function buildGrowthLeadOutreachPayload(input: {
  leadType: GrowthLeadType;
  name: string;
  city: string | null;
  discoveryMarketSlug: string | null;
  contactUrl: string | null;
  websiteUrl: string | null;
}): MarketingEmailPayload {
  const loc = discoveryPhrase(input.discoveryMarketSlug, input.city);
  const introByType: Record<GrowthLeadType, string> = {
    VENUE: `We're mapping open mics and live rooms${loc ? ` around ${loc}` : ""}. MicStage gives venues a structured public lineup and helps artists find real stages.`,
    ARTIST: `We're connecting performers with verified open mics${loc ? ` near ${loc}` : ""}. MicStage is built for artists who want real rooms, not random DMs.`,
    PROMOTER_ACCOUNT: `We're partnering with people who promote local lineups${loc ? ` in ${loc}` : ""}. MicStage surfaces structured venue pages and discovery by city.`,
  };
  const intro = introByType[input.leadType];

  const lines = [
    `Hi ${input.name},`,
    "",
    intro,
    "",
    input.websiteUrl ? `Site: ${input.websiteUrl}` : null,
    input.contactUrl ? `Contact: ${input.contactUrl}` : null,
    "",
    "— MicStage (draft — not sent)",
  ].filter(Boolean) as string[];

  const textBody = lines.join("\n");
  const htmlBody = `<p>Hi <strong>${escapeHtml(input.name)}</strong>,</p><p>${escapeHtml(intro)}</p>${
    input.websiteUrl ? `<p><a href="${escapeHtml(input.websiteUrl)}">Website</a></p>` : ""
  }${input.contactUrl ? `<p><a href="${escapeHtml(input.contactUrl)}">Contact / booking</a></p>` : ""}<p><em>MicStage draft — not sent</em></p>`;

  return {
    subject: `MicStage + ${input.name} (draft)`,
    textBody,
    htmlBody,
    tags: ["growth-lead", input.leadType.toLowerCase(), "draft"],
  };
}
