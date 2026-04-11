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
  outreachPlainLeanHtml,
} from "@/lib/marketing/outreachTemplates";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

/** Draft outreach bodies for imported / manual growth leads (not venue-claim cold). */
export function buildGrowthLeadOutreachPayload(input: {
  leadType: GrowthLeadType;
  name: string;
  city: string | null;
  discoveryMarketSlug: string | null;
  contactUrl: string | null;
  websiteUrl: string | null;
  /** When set on VENUE leads, adds a tracked link to venue registration. */
  leadId?: string | null;
  /** VENUE / ARTIST: mailbox used for "Hi {first}," salutation heuristic when applicable. */
  contactEmailForSalutation?: string | null;
}): MarketingEmailPayload {
  const subjectByType: Record<GrowthLeadType, string> = {
    VENUE: GROWTH_VENUE_OUTREACH_SUBJECT,
    ARTIST: GROWTH_ARTIST_OUTREACH_SUBJECT,
    PROMOTER_ACCOUNT: GROWTH_PROMOTER_OUTREACH_SUBJECT,
  };

  const baseUrl = appBaseUrl().replace(/\/$/, "");
  const claimVenueUrl =
    input.leadType === "VENUE" && input.leadId?.trim()
      ? `${baseUrl}/register/venue?growthLead=${encodeURIComponent(input.leadId.trim())}`
      : undefined;
  const claimArtistUrl =
    input.leadType === "ARTIST" && input.leadId?.trim()
      ? `${baseUrl}/register/musician?growthLead=${encodeURIComponent(input.leadId.trim())}`
      : undefined;

  const venueLetter = buildVenueOutreachLetter(input.name, {
    claimVenueUrl,
    contactEmail: input.leadType === "VENUE" ? input.contactEmailForSalutation : undefined,
  });
  const artistLetter = buildArtistOutreachLetter(input.name, {
    claimArtistUrl,
    contactEmail: input.leadType === "ARTIST" ? input.contactEmailForSalutation : undefined,
  });
  const promoterLetter = buildPromoterOutreachLetter(input.name);

  const coreText =
    input.leadType === "VENUE"
      ? venueLetter.textBody
      : input.leadType === "ARTIST"
        ? artistLetter.textBody
        : promoterLetter.textBody;

  let textBody = coreText;
  if (input.websiteUrl || input.contactUrl) {
    textBody += "\n";
    if (input.websiteUrl) textBody += `\nSite: ${input.websiteUrl}`;
    if (input.contactUrl) textBody += `\nContact: ${input.contactUrl}`;
  }
  textBody += `\n\n— ${OUTREACH_DRAFT_FOOTER_TEXT}`;

  const metaTail = [
    input.websiteUrl ? `Site: ${input.websiteUrl}` : "",
    input.contactUrl ? `Contact: ${input.contactUrl}` : "",
    `— ${OUTREACH_DRAFT_FOOTER_TEXT}`,
  ]
    .filter(Boolean)
    .join("\n");

  const htmlBody =
    input.leadType === "VENUE"
      ? venueLetter.htmlBody + outreachPlainLeanHtml(metaTail)
      : outreachPlainLeanHtml(textBody);

  return {
    subject: subjectByType[input.leadType],
    textBody,
    htmlBody,
    tags: ["growth-lead", input.leadType.toLowerCase(), "draft"],
  };
}
