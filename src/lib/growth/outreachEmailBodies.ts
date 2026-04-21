import type { GrowthLeadType } from "@/generated/prisma/client";
import type { MarketingEmailPayload } from "@/lib/marketing/emailPayloads";
import { appBaseUrl } from "@/lib/marketing/emailConfig";
import {
  buildArtistGrowthOutreachLetter,
  buildPromoterGrowthOutreachLetter,
  buildVenueGrowthOutreachLetter,
  formatGrowthOutreachAreaLabel,
  growthOutreachSubject,
  type GrowthOutreachSequenceStep,
  OUTREACH_DRAFT_FOOTER_TEXT,
  outreachPlainLeanHtml,
} from "@/lib/marketing/outreachTemplates";

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
  sequenceStep?: GrowthOutreachSequenceStep;
}): MarketingEmailPayload {
  const step: GrowthOutreachSequenceStep = input.sequenceStep ?? 1;
  const areaLabel = formatGrowthOutreachAreaLabel(input.city, input.discoveryMarketSlug);

  const baseUrl = appBaseUrl().replace(/\/$/, "");
  const claimVenueUrl =
    input.leadType === "VENUE" && input.leadId?.trim()
      ? `${baseUrl}/register/venue?growthLead=${encodeURIComponent(input.leadId.trim())}`
      : undefined;
  const claimArtistUrl =
    input.leadType === "ARTIST" && input.leadId?.trim()
      ? `${baseUrl}/register/musician?growthLead=${encodeURIComponent(input.leadId.trim())}`
      : undefined;

  const venueLetter = buildVenueGrowthOutreachLetter(input.name, step, {
    claimVenueUrl,
    areaLabel,
  });
  const artistLetter = buildArtistGrowthOutreachLetter(input.name, step, {
    claimArtistUrl,
    areaLabel,
  });
  const promoterLetter = buildPromoterGrowthOutreachLetter(step, { areaLabel });

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
    subject: growthOutreachSubject(input.leadType, step),
    textBody,
    htmlBody,
    tags: ["growth-lead", input.leadType.toLowerCase(), "draft", `seq-${step}`],
  };
}
