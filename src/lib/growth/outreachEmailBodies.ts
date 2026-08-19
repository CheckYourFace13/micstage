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
  /** Pre-resolved first-party click destination (listing page preferred for venues). */
  clickDestinationUrl?: string | null;
  listingName?: string | null;
  sequenceStep?: GrowthOutreachSequenceStep;
  /** Classified identity; do not force promoter/venue from leadType alone. */
  identity?: "VENUE" | "PROMOTER" | "ARTIST";
}): MarketingEmailPayload {
  const step: GrowthOutreachSequenceStep = input.sequenceStep ?? 1;
  const areaLabel = formatGrowthOutreachAreaLabel(input.city, input.discoveryMarketSlug);
  const sendAs = input.identity ?? (input.leadType === "PROMOTER_ACCOUNT" ? "PROMOTER" : input.leadType === "ARTIST" ? "ARTIST" : "VENUE");

  const baseUrl = appBaseUrl().replace(/\/$/, "");
  const resolvedClick = input.clickDestinationUrl?.trim();
  const claimVenueUrl =
    sendAs === "VENUE"
      ? resolvedClick ||
        (input.leadId?.trim()
          ? `${baseUrl}/register/venue?growthLead=${encodeURIComponent(input.leadId.trim())}`
          : undefined)
      : undefined;
  const claimArtistUrl =
    sendAs === "ARTIST"
      ? resolvedClick ||
        (input.leadId?.trim()
          ? `${baseUrl}/register/musician?growthLead=${encodeURIComponent(input.leadId.trim())}`
          : undefined)
      : undefined;
  const claimHostUrl =
    sendAs === "PROMOTER"
      ? resolvedClick || `${baseUrl}/host?growthLead=${encodeURIComponent(input.leadId?.trim() ?? "")}`
      : undefined;

  const venueLetter = buildVenueGrowthOutreachLetter(input.name, step, {
    claimVenueUrl,
    areaLabel,
    listingFirst: Boolean(resolvedClick?.includes("/open-mics/")),
  });
  const artistLetter = buildArtistGrowthOutreachLetter(input.name, step, {
    claimArtistUrl,
    areaLabel,
  });
  const promoterLetter = buildPromoterGrowthOutreachLetter(step, {
    areaLabel,
    hostUrl: claimHostUrl,
    openMicName: input.listingName ?? input.name,
  });

  const coreText =
    sendAs === "VENUE"
      ? venueLetter.textBody
      : sendAs === "ARTIST"
        ? artistLetter.textBody
        : promoterLetter.textBody;

  let textBody = coreText;
  if (input.websiteUrl || input.contactUrl) {
    textBody += "\n";
    if (input.websiteUrl) textBody += `\nSite: ${input.websiteUrl}`;
    if (input.contactUrl) textBody += `\nContact: ${input.contactUrl}`;
  }

  const metaTail = [
    input.websiteUrl ? `Site: ${input.websiteUrl}` : "",
    input.contactUrl ? `Contact: ${input.contactUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const htmlBody =
    sendAs === "VENUE"
      ? venueLetter.htmlBody + outreachPlainLeanHtml(metaTail)
      : outreachPlainLeanHtml(textBody);

  return {
    subject: growthOutreachSubject(sendAs === "PROMOTER" ? "PROMOTER_ACCOUNT" : sendAs === "ARTIST" ? "ARTIST" : "VENUE", step),
    textBody,
    htmlBody,
    tags: ["growth-lead", sendAs.toLowerCase(), `seq-${step}`],
  };
}
