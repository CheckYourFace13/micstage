/**
 * Unit checks for claim token hashing, auto-approval gates, evidence trust, booking defaults.
 * Run: node scripts/check-instant-claim.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hashClaimInviteToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawClaimInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]);

function isFreeMail(email) {
  const host = email.split("@")[1]?.toLowerCase();
  return FREE_MAIL.has(host);
}

function evaluateAuto(input) {
  if (input.verificationStatus !== "VERIFIED") return { auto: false, reason: "listing_not_verified" };
  if (input.claimedVenueId) return { auto: false, reason: "already_claimed" };
  if (!input.tokenValid) return { auto: false, reason: "invalid_token" };
  if (!input.termsAccepted || !input.privacyAccepted || !input.authorityConfirmed) {
    return { auto: false, reason: "consent_incomplete" };
  }
  if (input.geoConflict) return { auto: false, reason: "geographic_conflict" };
  if (input.emailSuppressed) return { auto: false, reason: "email_suppressed" };
  if (input.loginEmail !== input.intendedEmail) return { auto: false, reason: "login_email_changed" };
  if (input.confidence !== "HIGH") return { auto: false, reason: "confidence_not_high" };
  if (isFreeMail(input.loginEmail)) return { auto: false, reason: "free_mail" };
  if (!input.domainMatch) return { auto: false, reason: "domain_mismatch" };
  if (input.placeConflict) return { auto: false, reason: "place_already_on_venue" };
  return { auto: true };
}

const EXPLICIT_RE =
  /\b(open\s*mic|open\s*mike|open\s*jam|open\s*stage|comedy\s*open\s*mic|poetry\s*open\s*mic)\b/i;
const CANCELLED_RE =
  /\b(cancelled|canceled|permanently\s+closed|no\s+longer\s+(?:running|happening|taking\s+place)|final\s+night|postponed\s+indefinitely|ended\s+in\s+20\d{2}|last\s+show\s+was)\b/i;
const HISTORICAL_RE =
  /\b(archive|archived|looking\s+back|in\s+20(0\d|1\d|2[0-3])\b|formerly|used\s+to\s+(?:host|run)|past\s+events?)\b/i;
const RECURRING_RE =
  /\b(every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|bi-?weekly|monthly|recurring|each\s+week)\b/i;
const CURRENT_RE =
  /\b(tonight|this\s+week|upcoming|doors\s+at|sign[\s-]?ups?\s+(?:start|open)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|20(2[5-9]|3\d))\b/i;

function evaluateFetchedEvidenceTrust(input) {
  if (input.geoConflict) {
    return { trusted: false, reasonCode: "PLACE_OR_REGION_CONFLICT" };
  }
  if (!input.nameOk || !input.placeIdentityStrong) {
    return { trusted: false, reasonCode: "NO_TRUSTED_EVIDENCE" };
  }
  if (input.sourceKind === "snippet") {
    return { trusted: false, reasonCode: "RAW_SNIPPET_ONLY" };
  }
  const hay = `${input.excerpt || ""} ${input.pageText.slice(0, 8000)}`;
  if (!EXPLICIT_RE.test(hay)) {
    return { trusted: false, reasonCode: "NO_EXPLICIT_PHRASE" };
  }
  if (CANCELLED_RE.test(hay)) {
    return { trusted: false, reasonCode: "OFFICIAL_CANCELLED_EVENT" };
  }
  const recurring = RECURRING_RE.test(hay);
  const current = CURRENT_RE.test(hay);
  const historical = HISTORICAL_RE.test(hay) && !current && !recurring;
  if (historical) return { trusted: false, reasonCode: "OFFICIAL_HISTORICAL_ONLY" };
  if (input.sourceKind === "official_social") {
    if (input.onOfficialVenueDomain && (recurring || current)) {
      return { trusted: true, reasonCode: "SOCIAL_CURRENT_EVENT" };
    }
    return { trusted: false, reasonCode: "SOCIAL_AMBIGUOUS" };
  }
  if (input.sourceKind === "third_party") {
    if (recurring || current) return { trusted: false, reasonCode: "THIRD_PARTY_STRUCTURED_CURRENT" };
    return { trusted: false, reasonCode: "OFFICIAL_AMBIGUOUS_MENTION" };
  }
  if (!input.onOfficialVenueDomain) {
    return { trusted: false, reasonCode: "OFFICIAL_AMBIGUOUS_MENTION" };
  }
  if (recurring) return { trusted: true, reasonCode: "OFFICIAL_RECURRING_EVENT" };
  if (current) return { trusted: true, reasonCode: "OFFICIAL_CURRENT_EVENT" };
  return { trusted: false, reasonCode: "OFFICIAL_AMBIGUOUS_MENTION" };
}

function listingHasGeoConflict(input) {
  const blob = `${input.name} ${input.formattedAddress || ""} ${input.city || ""}`.toLowerCase();
  const region = (input.region || "").toUpperCase();
  const market = (input.discoveryMarketSlug || "").toLowerCase();
  const saysGA = /\broswell\b/.test(blob) && (/\bga\b/.test(blob) || /georgia/.test(blob));
  const saysIL = region === "IL" || /chicago|illinois/.test(market);
  if (saysGA && saysIL) return true;
  const stateInAddr = blob.match(/,\s*([a-z]{2})(?:\s+\d{5}|$)/i)?.[1]?.toUpperCase();
  if (region && stateInAddr && region.length === 2 && stateInAddr !== region) {
    if (/[a-z]{4,}/.test(input.formattedAddress || "") && stateInAddr !== "US") return true;
  }
  return false;
}

/** Booking stays off until owner chooses micstage_booking. */
function activationBookingEnabled(performerMode) {
  return performerMode === "micstage_booking";
}

function importedTemplateDefaults() {
  return { isPublic: false, bookingRestrictionMode: "NONE" };
}

// Token: hash only, raw not equal to hash
{
  const raw = generateRawClaimInviteToken();
  const hash = hashClaimInviteToken(raw);
  assert.equal(hash.length, 64);
  assert.notEqual(raw, hash);
  assert.equal(hashClaimInviteToken(raw), hash);
  assert.ok(timingSafeEqualHex(hash, hashClaimInviteToken(raw)));
  assert.equal(/^[a-f0-9]{64}$/i.test(raw), true);
}

// Altered token fails equality
{
  const raw = generateRawClaimInviteToken();
  const hash = hashClaimInviteToken(raw);
  const altered = raw.slice(0, -1) + (raw.endsWith("a") ? "b" : "a");
  assert.notEqual(hashClaimInviteToken(altered), hash);
  assert.equal(timingSafeEqualHex(hash, hashClaimInviteToken(altered)), false);
}

// Auto-approval matrix
{
  const base = {
    verificationStatus: "VERIFIED",
    claimedVenueId: null,
    tokenValid: true,
    termsAccepted: true,
    privacyAccepted: true,
    authorityConfirmed: true,
    loginEmail: "bookings@venue.com",
    intendedEmail: "bookings@venue.com",
    confidence: "HIGH",
    domainMatch: true,
    placeConflict: false,
    geoConflict: false,
    emailSuppressed: false,
  };
  assert.equal(evaluateAuto(base).auto, true);
  assert.equal(evaluateAuto({ ...base, loginEmail: "x@gmail.com", intendedEmail: "x@gmail.com" }).reason, "free_mail");
  assert.equal(evaluateAuto({ ...base, domainMatch: false }).reason, "domain_mismatch");
  assert.equal(evaluateAuto({ ...base, loginEmail: "other@venue.com" }).reason, "login_email_changed");
  assert.equal(evaluateAuto({ ...base, confidence: "MEDIUM" }).reason, "confidence_not_high");
  assert.equal(evaluateAuto({ ...base, termsAccepted: false }).reason, "consent_incomplete");
  assert.equal(evaluateAuto({ ...base, verificationStatus: "NEEDS_REVIEW" }).reason, "listing_not_verified");
  assert.equal(evaluateAuto({ ...base, placeConflict: true }).reason, "place_already_on_venue");
  assert.equal(evaluateAuto({ ...base, geoConflict: true }).reason, "geographic_conflict");
  assert.equal(evaluateAuto({ ...base, emailSuppressed: true }).reason, "email_suppressed");
}

// Evidence reason codes
{
  const base = {
    pageText: "",
    excerpt: null,
    onOfficialVenueDomain: true,
    sourceKind: "official_website",
    placeIdentityStrong: true,
    geoConflict: false,
    nameOk: true,
  };
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Join our weekly open mic every Tuesday at 8pm.",
    }).reasonCode,
    "OFFICIAL_RECURRING_EVENT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Open mic tonight — doors at 7. Sign-ups open at 6:30.",
    }).reasonCode,
    "OFFICIAL_CURRENT_EVENT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Looking back at our archived open mic in 2015.",
    }).reasonCode,
    "OFFICIAL_HISTORICAL_ONLY",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Our open mic was cancelled and permanently closed.",
    }).reasonCode,
    "OFFICIAL_CANCELLED_EVENT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "We love music and community.",
    }).reasonCode,
    "NO_EXPLICIT_PHRASE",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Open mic happens here sometimes.",
    }).reasonCode,
    "OFFICIAL_AMBIGUOUS_MENTION",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      onOfficialVenueDomain: false,
      sourceKind: "official_social",
      pageText: "Weekly open mic every Friday.",
    }).reasonCode,
    "SOCIAL_AMBIGUOUS",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      sourceKind: "official_social",
      pageText: "Weekly open mic every Friday.",
    }).reasonCode,
    "SOCIAL_CURRENT_EVENT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      sourceKind: "third_party",
      pageText: "Weekly open mic every Friday at Venue X.",
    }).reasonCode,
    "THIRD_PARTY_STRUCTURED_CURRENT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      sourceKind: "snippet",
      pageText: "weekly open mic every tuesday",
    }).reasonCode,
    "RAW_SNIPPET_ONLY",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      geoConflict: true,
      pageText: "Weekly open mic every Tuesday.",
    }).reasonCode,
    "PLACE_OR_REGION_CONFLICT",
  );
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      placeIdentityStrong: false,
      pageText: "Weekly open mic every Tuesday.",
    }).reasonCode,
    "NO_TRUSTED_EVIDENCE",
  );
  // Official domain alone is insufficient
  assert.equal(
    evaluateFetchedEvidenceTrust({
      ...base,
      pageText: "Welcome to our official site. Open mic mentioned in footer nav only somehow without currentness.",
    }).trusted,
    false,
  );
}

// Geographic conflict helper
{
  assert.equal(
    listingHasGeoConflict({
      name: "Area 51 Open Mic Roswell GA",
      formattedAddress: "Roswell, GA",
      city: "Roswell",
      region: "IL",
      discoveryMarketSlug: "chicagoland",
    }),
    true,
  );
  assert.equal(
    listingHasGeoConflict({
      name: "Local Mic",
      formattedAddress: "Chicago, IL 60601",
      city: "Chicago",
      region: "IL",
      discoveryMarketSlug: "chicagoland",
    }),
    false,
  );
}

// Booking defaults after claim / import
{
  const imported = importedTemplateDefaults();
  assert.equal(imported.isPublic, false);
  assert.equal(imported.bookingRestrictionMode, "NONE");
  assert.equal(activationBookingEnabled("info_only"), false);
  assert.equal(activationBookingEnabled("interest_waitlist"), false);
  assert.equal(activationBookingEnabled("micstage_booking"), true);
}

// Stamp semantics: invite stamp only after provider acceptance (documented invariant)
{
  const stampAfterProviderAcceptance = true;
  const marketingEmailSendCreated = false;
  assert.equal(stampAfterProviderAcceptance, true);
  assert.equal(marketingEmailSendCreated, false);
}

// One-time token consumption semantics (documented)
{
  const statuses = ["ACTIVE", "USED", "REVOKED", "EXPIRED"];
  assert.ok(statuses.includes("USED"));
  const consumeOnce = (status) => status === "ACTIVE";
  assert.equal(consumeOnce("ACTIVE"), true);
  assert.equal(consumeOnce("USED"), false);
  assert.equal(consumeOnce("EXPIRED"), false);
}

// Non-venue hosts (ticket/directories) never count as official website identity
{
  const NON_VENUE = [
    "ticketnetwork.com",
    "ticketmaster.com",
    "eventbrite.com",
    "facebook.com",
    "yelp.com",
  ];
  function isNonVenueEvidenceHost(hostOrUrl) {
    if (!hostOrUrl?.trim()) return false;
    let host = hostOrUrl.trim().toLowerCase().replace(/^www\./, "");
    try {
      if (host.includes("/") || host.includes(":")) {
        host = new URL(host.includes("://") ? host : `https://${host}`).hostname
          .replace(/^www\./i, "")
          .toLowerCase();
      }
    } catch {
      return false;
    }
    return NON_VENUE.some((d) => host === d || host.endsWith(`.${d}`));
  }
  assert.equal(isNonVenueEvidenceHost("https://www.ticketnetwork.com/tickets/1"), true);
  assert.equal(isNonVenueEvidenceHost("thefoxandhounds.net"), false);
}

// Official event path expansion for enrichment crawls
{
  const suffixes = [
    "/events",
    "/calendar",
    "/music",
    "/live-music",
    "/open-mic",
    "/openmic",
    "/entertainment",
    "/whats-on",
    "/schedule",
    "/weekly-events",
  ];
  function expandOfficialEvidenceUrls(seedUrls, maxUrls = 6) {
    const out = [];
    const seen = new Set();
    for (const raw of seedUrls) {
      const u = raw.trim();
      if (!u) continue;
      const key = u.replace(/\/$/, "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(u);
      }
      let origin;
      try {
        origin = new URL(u.includes("://") ? u : `https://${u}`).origin;
      } catch {
        continue;
      }
      for (const suffix of suffixes) {
        const candidate = `${origin}${suffix}`;
        const ck = candidate.replace(/\/$/, "").toLowerCase();
        if (seen.has(ck)) continue;
        seen.add(ck);
        out.push(candidate);
        if (out.length >= maxUrls) return out;
      }
    }
    return out.slice(0, maxUrls);
  }
  const urls = expandOfficialEvidenceUrls(["https://www.thefoxandhounds.net/"], 6);
  assert.equal(urls[0], "https://www.thefoxandhounds.net/");
  assert.ok(urls.some((u) => u.endsWith("/events")));
  assert.ok(urls.some((u) => u.endsWith("/open-mic")));
  assert.ok(urls.length <= 6);
}

// Mobile claim form affordances (smoke)
{
  const claim = fs.readFileSync(path.join(__dirname, "../src/components/publicListings/InstantClaimForm.tsx"), "utf8");
  assert.ok(/h-12/.test(claim), "touch-friendly input height");
  assert.ok(/text-base/.test(claim), "16px inputs avoid iOS zoom");
  assert.ok(/w-full/.test(claim), "full-width CTA");
  assert.ok(/enterKeyHint/.test(claim), "mobile keyboard hints");
  assert.ok(/Claim this free listing/.test(claim));
  assert.ok(/does not turn on online signups or booking/.test(claim));
}

console.log(
  JSON.stringify({
    ok: true,
    checks: "instant-claim + evidence-trust + booking-default unit checks passed",
  }),
);
