/**
 * Marketing outreach safeguards unit checks.
 * Run: node scripts/check-marketing-outreach.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.MARKETING_CLICK_SECRET = "test-click-secret";
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-unsub-secret";

const {
  evaluateGrowthLeadOutreachEligibility,
} = await import("../src/lib/growth/outreachContactEligible.ts");
const {
  buildMarketingClickToken,
  verifyMarketingClickToken,
} = await import("../src/lib/marketing/clickTracking.ts");
const {
  validateOutreachRuntimeValue,
} = await import("../src/lib/growth/outreachRuntimeSettings.ts");
const { verifyResendWebhookPayload } = await import("../src/lib/marketing/resendWebhookHandler.ts");
const { marketingUnsubscribeConfirmUrl } = await import("../src/lib/marketing/unsubscribeSigning.ts");

function baseLead(overrides = {}) {
  return {
    id: "lead1",
    leadType: "VENUE",
    status: "DISCOVERED",
    name: "Blue Note Open Mic",
    contactEmailNormalized: "events@bluenote.com",
    contactEmailConfidence: "HIGH",
    websiteUrl: "https://bluenote.com",
    contactUrl: null,
    websiteHostNormalized: "bluenote.com",
    openMicSignalTier: "EXPLICIT_OPEN_MIC",
    sourceKind: "WEBSITE_CONTACT",
    hasPendingDraft: false,
    hasRecentOutreachSend: false,
    deferClaimPath: false,
    listingRemoved: false,
    contact: null,
    suppressionBlocked: false,
    ...overrides,
  };
}

// Eligibility
assert.equal(evaluateGrowthLeadOutreachEligibility(baseLead()).reason, "eligible");
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contactEmailConfidence: "MEDIUM" })).reason,
  "not_high_confidence",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({ contactEmailNormalized: "info@chicagolandchamber.org", websiteUrl: "https://chicagolandchamber.org" }),
  ).reason,
  "chamber_tourism",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({ contactEmailNormalized: "host@gmail.com", websiteUrl: "https://bluenote.com" }),
  ).reason,
  "free_mail_mismatch",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contactEmailNormalized: "events@bluenote.com" })).eligible,
  true,
);
assert.equal(evaluateGrowthLeadOutreachEligibility(baseLead({ deferClaimPath: true })).reason, "defer_claim_path");
assert.equal(evaluateGrowthLeadOutreachEligibility(baseLead({ suppressionBlocked: true })).reason, "suppressed");
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contact: { status: "UNSUBSCRIBED" } })).reason,
  "unsubscribed",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contact: { status: "BOUNCED" } })).reason,
  "bounced",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contact: { status: "COMPLAINED" } })).reason,
  "complained",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ contact: { status: "DO_NOT_CONTACT" } })).reason,
  "do_not_contact",
);

// Runtime validation
assert.equal(validateOutreachRuntimeValue("GROWTH_OUTREACH_ENABLED", false).stored, "false");
assert.equal(validateOutreachRuntimeValue("GROWTH_OUTREACH_KILL", true).stored, "true");
assert.equal(validateOutreachRuntimeValue("GROWTH_OUTREACH_DAILY_MAX", 25).stored, "25");
assert.equal(validateOutreachRuntimeValue("GROWTH_OUTREACH_DOMAIN_DAILY_MAX", 1).stored, "1");
assert.equal(validateOutreachRuntimeValue("GROWTH_OUTREACH_SENDS_PER_CRON_RUN", 0).ok, true);

// Click tracking
const dest = "https://micstage.com/register/venue?growthLead=abc";
const token = buildMarketingClickToken("send123", dest);
const parsed = verifyMarketingClickToken(token);
assert.ok(parsed);
assert.equal(parsed.sendId, "send123");
assert.equal(parsed.destinationUrl, dest);
assert.equal(verifyMarketingClickToken(`${token}x`), null);
assert.equal(verifyMarketingClickToken("bad.token"), null);

// Signed external destination must not verify (open-redirect hardening)
const evilDest = "https://evil.example/phish";
const evilToken = buildMarketingClickToken("send123", evilDest);
assert.ok(evilToken.includes("."), "token is still HMAC-signed");
assert.equal(verifyMarketingClickToken(evilToken), null);
assert.equal(verifyMarketingClickToken(buildMarketingClickToken("send123", "http://micstage.com/register")), null);
assert.equal(
  verifyMarketingClickToken(buildMarketingClickToken("send123", "https://user:pass@micstage.com/register")),
  null,
);
assert.equal(
  verifyMarketingClickToken(buildMarketingClickToken("send123", "https://micstage.com.evil.example/")),
  null,
);

// Webhook rejects without secret
delete process.env.RESEND_WEBHOOK_SECRET;
assert.equal(
  verifyResendWebhookPayload("{}", { svixId: "1", svixTimestamp: "1", svixSignature: "x" }),
  null,
);

// Unsubscribe confirmation must ignore Hostinger bind origin (0.0.0.0)
{
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAppUrl = process.env.APP_URL;
  const prevPublic = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NODE_ENV = "production";
  process.env.APP_URL = "https://micstage.com";
  delete process.env.NEXT_PUBLIC_APP_URL;
  const internalReq = "http://0.0.0.0:3000/api/marketing/unsubscribe?contactId=x&sig=y";
  const okUrl = marketingUnsubscribeConfirmUrl("ok", internalReq);
  const invalidUrl = marketingUnsubscribeConfirmUrl("invalid", internalReq);
  assert.equal(okUrl, "https://micstage.com/unsubscribe?ok=1");
  assert.equal(invalidUrl, "https://micstage.com/unsubscribe?err=invalid");
  assert.equal(okUrl.includes("0.0.0.0"), false);
  process.env.APP_URL = "http://0.0.0.0:3000";
  const stillPublic = marketingUnsubscribeConfirmUrl("ok", internalReq);
  assert.equal(stillPublic, "https://micstage.com/unsubscribe?ok=1");
  if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
  if (prevAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = prevAppUrl;
  if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = prevPublic;
}

console.log(JSON.stringify({ ok: true, checks: "marketing-outreach" }));
