import type { GrowthLeadType } from "@/generated/prisma/client";
import type { MarketingEmailPayload } from "@/lib/marketing/emailPayloads";
import {
  buildArtistOutreachLetter,
  buildPromoterOutreachLetter,
  buildVenueOutreachLetter,
  GROWTH_ARTIST_OUTREACH_SUBJECT,
  GROWTH_PROMOTER_OUTREACH_SUBJECT,
  GROWTH_VENUE_OUTREACH_SUBJECT,
  OUTREACH_DRAFT_FOOTER_TEXT,
} from "@/lib/marketing/outreachTemplates";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const subjectByType: Record<GrowthLeadType, string> = {
    VENUE: GROWTH_VENUE_OUTREACH_SUBJECT,
    ARTIST: GROWTH_ARTIST_OUTREACH_SUBJECT,
    PROMOTER_ACCOUNT: GROWTH_PROMOTER_OUTREACH_SUBJECT,
  };

  const letterByType: Record<GrowthLeadType, { textBody: string; htmlBody: string }> = {
    VENUE: buildVenueOutreachLetter(input.name),
    ARTIST: buildArtistOutreachLetter(input.name),
    PROMOTER_ACCOUNT: buildPromoterOutreachLetter(input.name),
  };

  const { textBody: coreText, htmlBody: coreHtml } = letterByType[input.leadType];

  let textBody = coreText;
  if (input.websiteUrl || input.contactUrl) {
    textBody += "\n";
    if (input.websiteUrl) textBody += `\nSite: ${input.websiteUrl}`;
    if (input.contactUrl) textBody += `\nContact: ${input.contactUrl}`;
  }
  textBody += `\n\n— ${OUTREACH_DRAFT_FOOTER_TEXT}`;

  const appendixHtml = [
    input.websiteUrl ? `<p><a href="${escapeHtml(input.websiteUrl)}">Website</a></p>` : "",
    input.contactUrl ? `<p><a href="${escapeHtml(input.contactUrl)}">Contact / booking</a></p>` : "",
    `<p><em>${escapeHtml(OUTREACH_DRAFT_FOOTER_TEXT)}</em></p>`,
  ].join("");

  const htmlBody = `${coreHtml}${appendixHtml}`;

  return {
    subject: subjectByType[input.leadType],
    textBody,
    htmlBody,
    tags: ["growth-lead", input.leadType.toLowerCase(), "draft"],
  };
}
