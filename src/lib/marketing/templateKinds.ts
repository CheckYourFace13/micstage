/** Stable template keys for idempotency + admin filters. */
export const MARKETING_TEMPLATE_KINDS = {
  VENUE_CLAIM_INVITE: "VENUE_CLAIM_INVITE",
  /** Post-registration welcome / claim confirmation (env-gated auto-send). */
  VENUE_REGISTRATION_WELCOME: "VENUE_REGISTRATION_WELCOME",
  PERFORMER_LIFECYCLE: "PERFORMER_LIFECYCLE",
  VENUE_OUTREACH_COLD: "VENUE_OUTREACH_COLD",
  ADMIN_MANUAL_TEST: "ADMIN_MANUAL_TEST",
} as const;

export type MarketingTemplateKindId = (typeof MARKETING_TEMPLATE_KINDS)[keyof typeof MARKETING_TEMPLATE_KINDS];
