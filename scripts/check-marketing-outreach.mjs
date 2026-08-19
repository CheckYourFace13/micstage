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
const { classifyOutreachOpenMicEvidence } = await import("../src/lib/growth/outreachOpenMicEvidence.ts");
const { classifyOutreachNameQuality } = await import("../src/lib/growth/outreachNameQuality.ts");
const { classifyOutreachGeoIdentity } = await import("../src/lib/growth/outreachGeoIdentity.ts");
const {
  classifyFalseOpenMicSemantics,
  hasOpenMicEventSemantics,
} = await import("../src/lib/growth/openMicPhraseSemantics.ts");
const { scoreOpenMicVenueProspect } = await import("../src/lib/growth/discovery/venueOpenMicSignals.ts");
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
    schedules: [
      { title: "Open Mic", description: "Weekly open mic every Tuesday. Performers can sign up.", weekday: "TUESDAY", isActive: true },
    ],
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
  ident({
    name: "Bricktown Comedy Club",
    websiteUrl: "https://www.visitokc.com/event/open-mic-night",
    websiteHostNormalized: "visitokc.com",
  }).rejectClass,
  "chamber_tourism",
);
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

assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "SILO Dallas in Texas",
      websiteUrl: "https://silodallas.com/",
      websiteHostNormalized: "silodallas.com",
      contactEmailNormalized: "info@silodallas.com",
      schedules: [],
    }),
  ).eligible,
  false,
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "SILO Dallas in Texas",
      websiteUrl: "https://silodallas.com/",
      websiteHostNormalized: "silodallas.com",
      contactEmailNormalized: "info@silodallas.com",
      schedules: [{ title: "Open Mic", description: "Weekly open mic every Tuesday. Performers can sign up.", weekday: "TUESDAY", isActive: true }],
    }),
  ).eligible,
  true,
);

// --- Target-bound open-mic evidence (auto-send vs false positives) ---
assert.equal(hasOpenMicEventSemantics("Open Mike Eagle at Higher Ground"), false);
assert.equal(classifyFalseOpenMicSemantics("Higher Ground presents Open Mike Eagle tonight"), "open_mike_person");
assert.equal(classifyFalseOpenMicSemantics("She started at open mics in Chicago before touring"), "artist_bio");
assert.equal(classifyFalseOpenMicSemantics("wireless mic available for your event"), "microphone_equipment");
assert.equal(classifyFalseOpenMicSemantics("speaker and mic rental packages"), "microphone_equipment");
assert.equal(classifyFalseOpenMicSemantics("The patio is open to the public"), "generic_open_copy");
assert.equal(hasOpenMicEventSemantics("find open mic nights near you in a search result about another city"), false);

assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "Higher Ground",
    websiteUrl: "https://highergroundmusic.com/",
    websiteHostNormalized: "highergroundmusic.com",
    sourceSnippet: "Open Mike Eagle headlines Friday at Higher Ground",
    internalNotes: "Snippet: Open Mike Eagle at Higher Ground.",
  }).autoSend,
  false,
);
assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "14TENN",
    websiteUrl: "https://14tenn.828venues.com/",
    websiteHostNormalized: "14tenn.828venues.com",
    sourceSnippet: "wireless mic available, speaker and mic rental on site",
  }).rejectClass,
  "microphone_equipment_false_positive",
);
assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Cove Lounge",
    websiteUrl: "https://covelounge.com/events/open-mic",
    websiteHostNormalized: "covelounge.com",
    sourceUrl: "https://covelounge.com/events/open-mic",
    sourceTitle: "Open Mic",
    sourceSnippet: "The Cove Lounge hosts a weekly Open Mic. Performers can sign up at the door.",
    schedules: [{ title: "Open Mic", description: "Weekly open mic every Tuesday", isActive: true }],
  }).tier,
  "A",
);
assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "River Bar",
    websiteUrl: "https://riverbar.com/",
    websiteHostNormalized: "riverbar.com",
    sourceUrl: "https://riverbar.com/calendar",
    sourceTitle: "Calendar",
    about: "River Bar hosts a weekly open mic. Sign up for our open jam.",
  }).autoSend,
  true,
);
assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Fox",
    websiteUrl: "https://thefox.com/",
    websiteHostNormalized: "thefox.com",
    sourceSnippet: "Open mic every Tuesday at The Fox. Performers can sign up.",
    sourceUrl: "https://thefox.com/events/open-mic",
  }).autoSend,
  true,
);
assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Fox",
    websiteUrl: "https://thefox.com/",
    websiteHostNormalized: "thefox.com",
    sourceSnippet: "Open mic night in 2021 at The Fox. Looking back at our archive.",
    lastVerifiedAt: new Date("2021-04-01T00:00:00.000Z"),
    storedEvidence: [{ trusted: true, evidenceExcerpt: "Open mic night in 2021", evidenceDate: new Date("2021-04-01T00:00:00.000Z") }],
  }).rejectClass,
  "stale_open_mic_evidence",
);

assert.equal(classifyOutreachNameQuality({ name: "Under Construtcion" }).reason, "under_construction");
assert.equal(
  classifyOutreachNameQuality({
    name: "Downtown EDM, Themed Bar, Brunch Party, Bottomless Mimosas, Bottle Service Deal, Pizza, Happy Hour Las Vegas NV",
  }).ok,
  false,
);
assert.equal(classifyOutreachNameQuality({ name: "Salt Lake City Jazz Festival" }).festival, true);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "Salt Lake City Jazz Festival",
      websiteUrl: "https://slcjazzfestival.com/",
      websiteHostNormalized: "slcjazzfestival.com",
      contactEmailNormalized: "info@slcjazzfestival.com",
    }),
  ).reason,
  "festival_event_not_venue",
);
assert.equal(
  classifyOutreachGeoIdentity({
    name: "Cactus Club",
    city: "Toronto",
    region: "ON",
    websiteHostNormalized: "cactusclubmilwaukee.com",
    websiteUrl: "https://www.cactusclubmilwaukee.com/",
  }).conflict,
  true,
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "Cactus Club",
      city: "Toronto",
      region: "ON",
      websiteUrl: "https://www.cactusclubmilwaukee.com/",
      websiteHostNormalized: "cactusclubmilwaukee.com",
      contactEmailNormalized: "info@cactusclubmilwaukee.com",
      schedules: [{ title: "Open Mic", description: "Weekly open mic", isActive: true }],
    }),
  ).reason,
  "geography_conflict",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(baseLead({ name: "Under Construtcion", websiteUrl: "https://internationalbarslc.com/", websiteHostNormalized: "internationalbarslc.com" })).reason,
  "name_quality",
);

const scoredQueryPoison = scoreOpenMicVenueProspect({
  snippet: "Book our room for private events. Wireless mic available.",
  pageTextSample: "speaker and mic rental",
  title: "14TENN event spaces",
  searchQuery: "open mic nashville 14TENN",
  hasEmail: true,
  hasContactPath: true,
  hasSocial: false,
});
assert.equal(scoredQueryPoison.tier === "EXPLICIT_OPEN_MIC", false);

const scoredReal = scoreOpenMicVenueProspect({
  snippet: "Join us for weekly open mic every Tuesday. Performers can sign up.",
  pageTextSample: "The Cove Lounge hosts a weekly open mic.",
  title: "Open Mic at The Cove Lounge",
  searchQuery: "open mic chicago",
  hasEmail: true,
  hasContactPath: true,
  hasSocial: false,
});
assert.equal(scoredReal.tier, "EXPLICIT_OPEN_MIC");

const {
  expandOutreachEvidenceUrls,
  filterSameDomainUrls,
  mergeCrawlUrlPlan,
  OUTREACH_EVIDENCE_MAX_PAGES,
  parseRobotsTxtForCrawler,
  robotsAllowsPath,
  isOutreachEvidenceRecheckDue,
  nextOutreachEvidenceRecheckAt,
  outreachEvidenceRecheckDelayMs,
  permanentSkipReasonForLead,
  classifyCrawledPagesForOutreach,
} = await import("../src/lib/growth/outreachEvidenceCrawl.ts");
const { pickPrimaryVenueOutreachEmail } = await import("../src/lib/growth/discovery/venueEmailExtraction.ts");
const {
  classifyGrowthOpsState,
  reclassifyFormerManualReview,
  GROWTH_OPS_NO_HUMAN_APPROVAL,
  scoreResearchPriority,
} = await import("../src/lib/growth/growthOpsState.ts");
const {
  evaluateOutreachAutoRamp,
  providerMarketingCeiling,
} = await import("../src/lib/growth/outreachAutoRamp.ts");

assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Fox",
    websiteUrl: "https://thefox.com/",
    websiteHostNormalized: "thefox.com",
    sourceUrl: "https://thefox.com/calendar",
    sourceTitle: "Calendar",
    about: "The Fox hosts an open jam every Thursday. Performers can sign up at the door.",
  }).tier,
  "A",
);

assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Fox",
    websiteUrl: "https://thefox.com/",
    websiteHostNormalized: "thefox.com",
    sourceUrl: "https://thefox.com/",
    about: "Craft beer, trivia on Tuesdays, and private events.",
  }).autoSend,
  false,
);

assert.equal(
  classifyOutreachOpenMicEvidence({
    name: "The Fox",
    websiteUrl: "https://thefox.com/",
    websiteHostNormalized: "thefox.com",
    sourceUrl: "https://www.yelp.com/biz/the-fox-chicago",
    sourceSnippet: "Open mic every Tuesday at The Fox. Performers can sign up.",
  }).tier === "A",
  false,
);

const beforeEnrich = classifyOutreachOpenMicEvidence({
  name: "River Bar",
  websiteUrl: "https://riverbar.com/",
  websiteHostNormalized: "riverbar.com",
  sourceUrl: "https://riverbar.com/",
  about: "Neighborhood bar with craft beer.",
});
assert.equal(beforeEnrich.autoSend, false);
const afterEnrich = classifyCrawledPagesForOutreach({
  name: "River Bar",
  websiteUrl: "https://riverbar.com/",
  websiteHostNormalized: "riverbar.com",
  pages: [
    {
      url: "https://riverbar.com/calendar",
      title: "Events",
      text: "River Bar hosts a weekly open mic every Monday. Sign up at 7pm.",
    },
  ],
});
assert.equal(afterEnrich.tier, "A");
assert.equal(afterEnrich.autoSend, true);

assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "River Bar",
      websiteUrl: "https://riverbar.com/",
      websiteHostNormalized: "riverbar.com",
      contactEmailNormalized: null,
      contactEmailConfidence: null,
      schedules: [],
      discoveryHints: {
        outreachEvidence: {
          url: "https://riverbar.com/calendar",
          snippet: "River Bar hosts a weekly open mic every Monday. Sign up at 7pm.",
          title: "Events",
          eventName: "weekly open mic",
          sourceType: "official_website",
          tier: "A",
        },
      },
    }),
  ).reason,
  "missing_email",
);
assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "River Bar",
      websiteUrl: "https://riverbar.com/",
      websiteHostNormalized: "riverbar.com",
      contactEmailNormalized: "events@riverbar.com",
      contactEmailConfidence: "HIGH",
      schedules: [],
      discoveryHints: {
        outreachEvidence: {
          url: "https://riverbar.com/calendar",
          snippet: "River Bar hosts a weekly open mic every Monday. Sign up at 7pm.",
          title: "Events",
          eventName: "weekly open mic",
          sourceType: "official_website",
          tier: "A",
        },
      },
    }),
  ).reason,
  "eligible",
);

const mined = pickPrimaryVenueOutreachEmail(
  [
    { email: "events@riverbar.com", source: "mailto" },
    { email: "noreply@mailchimp.com", source: "body" },
  ],
  "riverbar.com",
);
assert.equal(mined.primary, "events@riverbar.com");

assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      name: "City Lights Entertainment",
      websiteUrl: "https://citylightsent.com/",
      websiteHostNormalized: "citylightsent.com",
      contactEmailNormalized: "hello@citylightsent.com",
      schedules: [{ title: "Open Mic", description: "Weekly open mic every Tuesday. Performers can sign up.", isActive: true }],
    }),
  ).reason,
  "auto_research_retry",
);

assert.equal(
  evaluateGrowthLeadOutreachEligibility(
    baseLead({
      status: "DISCOVERED",
      name: "The Cove Lounge",
      websiteUrl: "https://covelounge.com/",
      websiteHostNormalized: "covelounge.com",
      contactEmailNormalized: "events@covelounge.com",
      sourceUrl: "https://covelounge.com/events/open-mic",
    }),
  ).reason,
  "eligible",
);

const skipDir = permanentSkipReasonForLead({
  name: "Best Open Mics Near You",
  leadType: "VENUE",
  websiteUrl: "https://opencomedy.com/chicago",
  websiteHostNormalized: "opencomedy.com",
});
assert.equal(skipDir, "directory");

const future = nextOutreachEvidenceRecheckAt("no_evidence_real_venue", new Date("2026-08-18T00:00:00.000Z"));
assert.equal(future.getTime() > new Date("2026-09-15T00:00:00.000Z").getTime(), true);
assert.equal(
  isOutreachEvidenceRecheckDue(
    { skipPermanent: true, nextCheckAt: new Date("2020-01-01").toISOString() },
    new Date(),
  ),
  false,
);
assert.equal(
  isOutreachEvidenceRecheckDue(
    { skipPermanent: false, nextCheckAt: new Date("2026-07-01").toISOString() },
    new Date("2026-08-18T00:00:00.000Z"),
  ),
  true,
);

const expanded = expandOutreachEvidenceUrls("https://thefox.com/", OUTREACH_EVIDENCE_MAX_PAGES);
assert.equal(expanded.length <= OUTREACH_EVIDENCE_MAX_PAGES, true);
assert.equal(expanded.some((u) => u.includes("/events")), true);
assert.equal(expanded.some((u) => u.includes("/open-mics")), true);

const sameHost = filterSameDomainUrls(
  ["https://thefox.com/events", "https://yelp.com/biz/the-fox", "https://calendar.thefox.com/open-mic"],
  "thefox.com",
);
assert.equal(sameHost.includes("https://thefox.com/events"), true);
assert.equal(sameHost.some((u) => u.includes("yelp.com")), false);

const plan = mergeCrawlUrlPlan("https://thefox.com/", ["https://evil.example/open-mic", "https://thefox.com/comedy"], 8);
assert.equal(plan.some((u) => u.includes("evil.example")), false);
assert.equal(plan.length <= 8, true);

const robots = parseRobotsTxtForCrawler(`User-agent: *\nDisallow: /admin\nAllow: /\n`);
assert.equal(robotsAllowsPath("/events", robots), true);
assert.equal(robotsAllowsPath("/admin/secret", robots), false);

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

// Autonomous ops states — no human review queue
assert.equal(GROWTH_OPS_NO_HUMAN_APPROVAL, true);
assert.equal(
  classifyGrowthOpsState({
    hardReject: null,
    identityDecision: "manual_review",
    evidenceAutoSend: false,
    contactHigh: false,
  }).state,
  "AUTO_RESEARCH_RETRY",
);
assert.equal(
  classifyGrowthOpsState({
    hardReject: null,
    identityDecision: "eligible_venue",
    evidenceAutoSend: true,
    contactHigh: true,
  }).state,
  "AUTO_SEND_READY",
);
assert.equal(
  classifyGrowthOpsState({
    hardReject: "directory",
    identityDecision: "manual_review",
    evidenceAutoSend: true,
    contactHigh: true,
  }).state,
  "HARD_REJECT",
);
assert.equal(
  reclassifyFormerManualReview({
    hardReject: null,
    identityDecision: "manual_review",
    evidenceAutoSend: false,
    contactHigh: false,
  }).state,
  "AUTO_RESEARCH_RETRY",
);
assert.equal(
  scoreResearchPriority({
    opsState: "HARD_REJECT",
    skipPermanent: true,
    hasWebsite: true,
    googlePlaceId: true,
    openMicSignalTier: "EXPLICIT_OPEN_MIC",
    contactHigh: false,
    evidenceAutoSend: false,
  }),
  -1,
);
assert.equal(outreachEvidenceRecheckDelayMs("crawl_failed"), 7 * 86400000);
assert.equal(outreachEvidenceRecheckDelayMs("weak_evidence"), 14 * 86400000);
assert.equal(outreachEvidenceRecheckDelayMs("no_evidence_real_venue"), 30 * 86400000);
assert.equal(outreachEvidenceRecheckDelayMs("tier_a"), 60 * 86400000);

const rampNow = new Date("2026-08-20T00:00:00.000Z");
const rampEntered = new Date("2026-08-17T00:00:00.000Z");
const healthyRamp = evaluateOutreachAutoRamp({
  currentDailyMax: 25,
  stageEnteredAt: rampEntered,
  now: rampNow,
  sentInWindow: 25,
  complaints: 0,
  hardBounceRate: 0.01,
  bounceStopRate: 0.05,
  healthOk: true,
  targetingOk: true,
  earlyComplaintThrottle: false,
  securityGateClear: true,
});
assert.equal(healthyRamp.ramp, true);
assert.equal(healthyRamp.nextDailyMax, 50);
const blockedRamp = evaluateOutreachAutoRamp({
  currentDailyMax: 25,
  stageEnteredAt: rampEntered,
  now: rampNow,
  sentInWindow: 25,
  complaints: 1,
  hardBounceRate: 0.01,
  bounceStopRate: 0.05,
  healthOk: true,
  targetingOk: true,
  earlyComplaintThrottle: false,
  securityGateClear: true,
});
assert.equal(blockedRamp.ramp, false);
assert.equal(blockedRamp.reason, "hold_unhealthy");
assert.equal(providerMarketingCeiling(95, 35), 60);

const blockedSecurityRamp = evaluateOutreachAutoRamp({
  currentDailyMax: 25,
  stageEnteredAt: rampEntered,
  now: rampNow,
  sentInWindow: 25,
  complaints: 0,
  hardBounceRate: 0.01,
  bounceStopRate: 0.05,
  healthOk: true,
  targetingOk: true,
  earlyComplaintThrottle: false,
  securityGateClear: false,
});
assert.equal(blockedSecurityRamp.ramp, false);
assert.equal(blockedSecurityRamp.reason, "hold_rls_security_gate");
assert.equal(blockedSecurityRamp.nextDailyMax, 25);

const { clampOutreachDailyMaxForRlsGate } = await import("../src/lib/database/databaseRlsSecurity.ts");
assert.equal(clampOutreachDailyMaxForRlsGate(50, false), 25);
assert.equal(clampOutreachDailyMaxForRlsGate(50, true), 50);

console.log(JSON.stringify({ ok: true, checks: "marketing-outreach" }));
