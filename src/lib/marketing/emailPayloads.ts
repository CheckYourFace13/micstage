import {
  buildVenueOutreachLetter,
  GROWTH_VENUE_OUTREACH_SUBJECT,
  OUTREACH_DRAFT_FOOTER_TEXT,
} from "@/lib/marketing/outreachTemplates";

/**
 * Email bodies for future dispatch only — phase 1 generates structured payloads; nothing is sent.
 */
export type MarketingEmailPayload = {
  subject: string;
  textBody: string;
  htmlBody: string;
  /** Optional tags for future ESP routing. */
  tags?: string[];
};

export function buildInternalMarketingNoticeEmail(input: {
  title: string;
  summaryLines: string[];
}): MarketingEmailPayload {
  const textBody = [input.title, "", ...input.summaryLines.map((l) => `• ${l}`)].join("\n");
  const htmlBody = `<p><strong>${escapeHtml(input.title)}</strong></p><ul>${input.summaryLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
  return {
    subject: `[MicStage marketing] ${input.title}`,
    textBody,
    htmlBody,
    tags: ["internal", "marketing-infra"],
  };
}

export function buildVenueOutreachEmailPayload(input: {
  venueName: string;
  /** Discovery rollup label; reserved for future localized copy — default template is Chicagoland-agnostic in the body. */
  discoveryLabel: string | null;
  publicVenueUrl: string;
  locationPerformersUrl: string | null;
}): MarketingEmailPayload {
  void input.discoveryLabel;

  const { textBody: coreText, htmlBody: coreHtml } = buildVenueOutreachLetter(input.venueName);

  const textBody = [
    coreText,
    "",
    `Venue page: ${input.publicVenueUrl}`,
    input.locationPerformersUrl ? `Local discovery: ${input.locationPerformersUrl}` : null,
    "",
    `— ${OUTREACH_DRAFT_FOOTER_TEXT}`,
  ]
    .filter(Boolean)
    .join("\n");

  const loc = input.locationPerformersUrl
    ? `<p><a href="${escapeHtml(input.locationPerformersUrl)}">Local discovery</a></p>`
    : "";

  const htmlBody = `${coreHtml}<p><a href="${escapeHtml(input.publicVenueUrl)}">Venue page</a></p>${loc}<p><em>${escapeHtml(OUTREACH_DRAFT_FOOTER_TEXT)}</em></p>`;

  return {
    subject: GROWTH_VENUE_OUTREACH_SUBJECT,
    textBody,
    htmlBody,
    tags: ["venue-outreach", "draft"],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
