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
  discoveryLabel: string | null;
  publicVenueUrl: string;
  locationPerformersUrl: string | null;
  /** Placeholder — replace with approved copy before any live send. */
  bodyIntro?: string;
}): MarketingEmailPayload {
  const intro =
    input.bodyIntro ??
    `We're highlighting open mic activity${input.discoveryLabel ? ` in ${input.discoveryLabel}` : ""}. ` +
      `MicStage helps venues publish structured lineups and lets artists discover real rooms.`;

  const textBody = [
    `Hi ${input.venueName} team,`,
    "",
    intro,
    "",
    `Venue page: ${input.publicVenueUrl}`,
    input.locationPerformersUrl ? `Local discovery: ${input.locationPerformersUrl}` : null,
    "",
    "— MicStage (draft — not sent)",
  ]
    .filter(Boolean)
    .join("\n");

  const loc = input.locationPerformersUrl
    ? `<p><a href="${escapeHtml(input.locationPerformersUrl)}">Local discovery</a></p>`
    : "";

  const htmlBody = `<p>Hi <strong>${escapeHtml(input.venueName)}</strong> team,</p><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(input.publicVenueUrl)}">Venue page</a></p>${loc}<p><em>MicStage draft — not sent</em></p>`;

  return {
    subject: `MicStage + ${input.venueName} (draft)`,
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
