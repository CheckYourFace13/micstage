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
  hasOtherInFlightOutreachDraft,
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
const { classifyOutreachTargetIdentity } = await import("../src/lib/growth/outreachTargetIdentity.ts");
const {
  finalizeOutreachSendBodies,
  OUTREACH_DRAFT_FOOTER_TEXT,
} = await import("../src/lib/marketing/outreachSendBodies.ts");
const { buildGrowthLeadOutreachPayload } = await import("../src/lib/growth/outreachEmailBodies.ts");

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
assert.equal(evaluateGrowthLeadOutreachEligibility(baseLead({ hasPendingDraft: true })).reason, "pending_draft");
assert.equal(hasOtherInFlightOutreachDraft([{ id: "draft-a" }]), true);
assert.equal(hasOtherInFlightOutreachDraft([{ id: "draft-a" }], "draft-a"), false);
assert.equal(hasOtherInFlightOutreachDraft([{ id: "draft-a" }, { id: "draft-b" }], "draft-a"), true);
assert.equal(hasOtherInFlightOutreachDraft([], "draft-a"), false);

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

// HIGH confidence alone is not enough
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({ websiteUrl: null, websiteHostNormalized: null, contactUrl: null, name: "Unverified Prospect" }),
  ).reason,
  "weak_identity",
);

function ident(overrides = {}) {
  return classifyOutreachTargetIdentity({
    name: "Blue Note",
    leadType: "VENUE",
    websiteUrl: "https://bluenote.com/",
    websiteHostNormalized: "bluenote.com",
    contactEmailNormalized: "events@bluenote.com",
    sourceKind: "WEBSITE_CONTACT",
    openMicSignalTier: "EXPLICIT_OPEN_MIC",
    ...overrides,
  });
}

// REJECT directories / aggregators / tourism / vendors
assert.equal(
  ident({
    name: "Comedy Shows near Charlotte Nc, United States",
    websiteUrl: "https://opencomedy.com/usa/gigs/charlotte-nc",
    websiteHostNormalized: "opencomedy.com",
    contactEmailNormalized: "hello@opencomedy.com",
  }).decision,
  "ineligible",
);
assert.equal(
  ident({
    name: "Comedy Shows near Charlotte Nc, United States",
    websiteUrl: "https://opencomedy.com/usa/gigs/charlotte-nc",
    websiteHostNormalized: "opencomedy.com",
    contactEmailNormalized: "hello@opencomedy.com",
  }).rejectClass,
  "directory",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "Comedy Shows near Charlotte Nc, United States",
      websiteUrl: "https://opencomedy.com/usa/gigs/charlotte-nc",
      websiteHostNormalized: "opencomedy.com",
      contactEmailNormalized: "hello@opencomedy.com",
    }),
  ).reason,
  "directory_aggregator",
);
assert.equal(
  ident({
    name: "It's Your Night DJs",
    websiteUrl: "https://www.itsyournight.com/",
    websiteHostNormalized: "itsyournight.com",
    contactEmailNormalized: "info@itsyournight.com",
    formattedAddress: "312 N Oak St, Roanoke, TX 76262, USA",
    googlePlaceId: "ChIJF4MvGovUTYYRFb99OKhCUyI",
    listingLat: 33.001,
    listingLng: -97.227,
  }).rejectClass,
  "service_company",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "It's Your Night DJs",
      websiteUrl: "https://www.itsyournight.com/",
      websiteHostNormalized: "itsyournight.com",
      contactEmailNormalized: "info@itsyournight.com",
    }),
  ).reason,
  "service_company",
);
assert.equal(ident({ name: "Best American Restaurant in Milwaukee", websiteUrl: "https://redrockmilwaukee.com/", websiteHostNormalized: "redrockmilwaukee.com" }).rejectClass, "directory");
assert.equal(
  ident({
    name: "Don't Tell Comedy: Secret Comedy Shows across the U.S.",
    websiteUrl: "https://www.donttellcomedy.com/",
    websiteHostNormalized: "donttellcomedy.com",
  }).rejectClass,
  "directory",
);
assert.equal(
  ident({
    name: "Much",
    websiteUrl: "https://www.nashvillescene.com/music/much-loved-comedian/article_29bfdf8f.html",
    websiteHostNormalized: "nashvillescene.com",
  }).rejectClass,
  "directory",
);
assert.equal(ident({ name: "The Green Mill", websiteUrl: "https://www.yelp.com/biz/green-mill", websiteHostNormalized: "yelp.com" }).rejectClass, "directory");
assert.equal(ident({ name: "Open Mic Night", websiteUrl: "https://www.eventbrite.com/o/some-organizer", websiteHostNormalized: "eventbrite.com" }).rejectClass, "directory");
assert.equal(ident({ name: "Visit Phoenix Tourism Bureau", websiteUrl: "https://visitphoenix.com/", websiteHostNormalized: "visitphoenix.com" }).rejectClass, "chamber_tourism");
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({ name: "Austin Chamber of Commerce", websiteUrl: "https://austinchamber.com", websiteHostNormalized: "austinchamber.com", contactEmailNormalized: "info@austinchamber.com" }),
  ).reason,
  "chamber_tourism",
);
assert.equal(ident({ name: "Bliss Wedding DJ", websiteUrl: "https://blissweddingdj.com/", websiteHostNormalized: "blissweddingdj.com" }).rejectClass, "service_company");
assert.equal(ident({ name: "Sparkle Event Planners", websiteUrl: "https://sparkleplanners.com/", websiteHostNormalized: "sparkleplanners.com" }).rejectClass, "service_company");
assert.equal(ident({ name: "StageReady AV Company", websiteUrl: "https://stagereadyav.com/", websiteHostNormalized: "stagereadyav.com" }).rejectClass, "service_company");
assert.equal(ident({ name: "Glow Photo Booth Co", websiteUrl: "https://glowphotobooth.com/", websiteHostNormalized: "glowphotobooth.com" }).rejectClass, "service_company");
assert.equal(
  ident({
    name: "Open Mics Near Denver",
    websiteUrl: "https://timeout.com/denver/open-mics",
    websiteHostNormalized: "timeout.com",
    googlePlaceId: null,
  }).rejectClass,
  "directory",
);

// ALLOW real venues / promoter
assert.equal(
  ident({
    name: "Hoppy Barrel Brewery",
    websiteUrl: "https://hoppybarrel.com/",
    websiteHostNormalized: "hoppybarrel.com",
    contactEmailNormalized: "events@hoppybarrel.com",
    formattedAddress: "100 Main St, Austin, TX 78701, USA",
    googlePlaceId: "ChIJ-brewery",
    listingLat: 30.26,
    listingLng: -97.74,
    city: "Austin",
    region: "TX",
  }).decision,
  "eligible_venue",
);
assert.equal(
  ident({
    name: "The Copper Tap Bar",
    websiteUrl: "https://coppertapbar.com/",
    websiteHostNormalized: "coppertapbar.com",
    contactEmailNormalized: "booking@coppertapbar.com",
    formattedAddress: "12 Oak Ave, Nashville, TN 37203, USA",
    googlePlaceId: "ChIJ-bar",
    listingLat: 36.16,
    listingLng: -86.78,
  }).decision,
  "eligible_venue",
);
assert.equal(
  ident({
    name: "Laugh Track Comedy Club",
    websiteUrl: "https://laughtrackclub.com/",
    websiteHostNormalized: "laughtrackclub.com",
    contactEmailNormalized: "host@laughtrackclub.com",
    formattedAddress: "9 Stage Rd, Chicago, IL 60614, USA",
    googlePlaceId: "ChIJ-comedy",
    listingLat: 41.92,
    listingLng: -87.65,
  }).decision,
  "eligible_venue",
);
assert.equal(
  ident({
    name: "Stereo Live",
    websiteUrl: "https://stereolive.com/",
    websiteHostNormalized: "stereolive.com",
    contactEmailNormalized: "info@stereolive.com",
    formattedAddress: "6400 Richmond Ave, Houston, TX 77057, USA",
    googlePlaceId: "ChIJb2TAHcjDQIYRXjZegL5i9Wk",
    listingLat: 29.73,
    listingLng: -95.49,
  }).decision,
  "eligible_venue",
);
assert.equal(
  ident({
    name: "Nightshift Productions",
    leadType: "PROMOTER_ACCOUNT",
    websiteUrl: "https://nightshiftpresents.com/",
    websiteHostNormalized: "nightshiftpresents.com",
    contactEmailNormalized: "booking@nightshiftpresents.com",
  }).decision,
  "eligible_promoter",
);

// MANUAL REVIEW
assert.equal(
  ident({
    name: "City Lights Entertainment",
    websiteUrl: "https://citylightsent.com/",
    websiteHostNormalized: "citylightsent.com",
    contactEmailNormalized: "hello@citylightsent.com",
  }).decision,
  "manual_review",
);
assert.equal(
  ident({
    name: "Music House",
    websiteUrl: "https://www.musichouseschool.com/",
    websiteHostNormalized: "musichouseschool.com",
    formattedAddress: "1 Main St, Lenexa, KS 66215, USA",
    googlePlaceId: "ChIJ-school",
    listingLat: 38.95,
    listingLng: -94.73,
  }).decision,
  "manual_review",
);
assert.equal(
  ident({
    name: "Aria Promotions",
    leadType: "PROMOTER_ACCOUNT",
    websiteUrl: null,
    websiteHostNormalized: null,
    contactEmailNormalized: "aria@gmail.com",
  }).decision,
  "manual_review",
);
assert.equal(
  ident({
    name: "The Alley Cat",
    websiteUrl: null,
    websiteHostNormalized: null,
    city: "Toledo",
    region: "OH",
    formattedAddress: "88 Water St, Toledo, OH 43604, USA",
  }).decision,
  "manual_review",
);

assert.equal(evaluateGrowthLeadOutreachEligibility(baseLead({ name: "SILO Dallas in Texas", websiteUrl: "https://silodallas.com/", websiteHostNormalized: "silodallas.com", contactEmailNormalized: "info@silodallas.com" })).eligible, true);

// Draft-only copy must not survive into production send representation
const draftPayload = buildGrowthLeadOutreachPayload({
  leadType: "VENUE",
  name: "Blue Note",
  city: "Chicago",
  discoveryMarketSlug: "chicagoland-il",
  contactUrl: null,
  websiteUrl: "https://bluenote.com",
  leadId: "lead1",
});
assert.equal(draftPayload.textBody.includes(OUTREACH_DRAFT_FOOTER_TEXT), false);
assert.equal(draftPayload.htmlBody.includes(OUTREACH_DRAFT_FOOTER_TEXT), false);
assert.equal(draftPayload.textBody.toLowerCase().includes("not sent"), false);

const leaked = finalizeOutreachSendBodies({
  html: `${draftPayload.htmlBody}<p><em>${OUTREACH_DRAFT_FOOTER_TEXT}</em></p>`,
  text: `${draftPayload.textBody}\n\n— ${OUTREACH_DRAFT_FOOTER_TEXT}\n[micstage_email_meta] count=1`,
});
assert.equal(leaked.ok, true);
if (leaked.ok) {
  assert.equal(leaked.text.includes(OUTREACH_DRAFT_FOOTER_TEXT), false);
  assert.equal(leaked.html.includes(OUTREACH_DRAFT_FOOTER_TEXT), false);
  assert.equal(leaked.text.includes("[micstage_email_meta]"), false);
  assert.equal(leaked.text.toLowerCase().includes("not sent"), false);
}

console.log(JSON.stringify({ ok: true, checks: "marketing-outreach" }));
