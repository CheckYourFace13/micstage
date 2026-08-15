/**
 * Unit checks for self-service open-mic removal auth + effects (no DB writes).
 * Run: node scripts/check-open-mic-self-removal.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC = new Set(["open mic", "open mike", "open jam", "open stage", "open mic night", "jam night"]);

function isDistinctiveOpenMicBrand(name) {
  const n = norm(name);
  if (n.length < 8) return false;
  if (GENERIC.has(n)) return false;
  const tokens = n.split(" ").filter(Boolean);
  if (tokens.length >= 3) return true;
  if (/\d/.test(n)) return true;
  if (tokens.length === 2 && tokens[0] === "open" && tokens[1] === "mic") return false;
  return tokens.length >= 2 && !GENERIC.has(n);
}

function brandAppearsInListing(brand, blob) {
  const b = norm(brand);
  if (!isDistinctiveOpenMicBrand(b)) return false;
  return blob.includes(b);
}

function evaluatePromoterListingAuthorization(promoter, listing) {
  const blob = norm(
    [listing.name, listing.about, listing.formattedAddress, listing.city, listing.region]
      .filter(Boolean)
      .join(" "),
  );
  for (const s of promoter.series) {
    if (brandAppearsInListing(s.name, blob)) return "series";
  }
  const app = promoter.application;
  if (app?.status === "APPROVED" && app.brandName && brandAppearsInListing(app.brandName, blob)) {
    if (norm(listing.name).includes(norm(app.brandName))) return "application";
  }
  return null;
}

// Distinctive brand rules
assert.equal(isDistinctiveOpenMicBrand("open mic"), false);
assert.equal(isDistinctiveOpenMicBrand("OPEN MIC 2.0"), true);
assert.equal(isDistinctiveOpenMicBrand("Friday Night Open Mic"), true);

// Eligio-style authorization WITHOUT venue access
{
  const eligio = {
    application: {
      status: "APPROVED",
      brandName: "OPEN MIC 2.0",
      notes: "Weekly, Fridays, The Fox and The Hounds,",
      cityRegion: "Los Angeles",
    },
    series: [{ name: "OPEN MIC 2.0" }],
  };
  const listing = {
    name: "OPEN MIC 2.0 at The Fox and Hounds",
    about: "Weekly open mic every Friday",
    formattedAddress: "The Fox and Hounds, Studio City, Los Angeles, CA",
    city: "Studio City",
    region: "CA",
  };
  assert.equal(evaluatePromoterListingAuthorization(eligio, listing), "series");
}

// Unrelated promoter cannot remove
{
  const other = {
    application: { status: "APPROVED", brandName: "Comedy Slam", notes: "Chicago", cityRegion: "Chicago" },
    series: [{ name: "Comedy Slam" }],
  };
  const listing = {
    name: "OPEN MIC 2.0 at The Fox and Hounds",
    about: null,
    formattedAddress: "Studio City",
    city: "Studio City",
    region: "CA",
  };
  assert.equal(evaluatePromoterListingAuthorization(other, listing), null);
}

// Generic "Open Mic" series does not authorize random listings
{
  const generic = {
    application: { status: "APPROVED", brandName: "Open Mic", notes: "somewhere", cityRegion: "LA" },
    series: [{ name: "Open Mic" }],
  };
  const listing = {
    name: "Kafe Kerouac Open Mic",
    about: null,
    formattedAddress: "Columbus, OH",
    city: "Columbus",
    region: "OH",
  };
  assert.equal(evaluatePromoterListingAuthorization(generic, listing), null);
}

// Removal does not require PromoterVenueAccess (documented invariant in source)
{
  const src = fs.readFileSync(path.join(__dirname, "../src/lib/publicListings/openMicSelfRemoval.ts"), "utf8");
  assert.ok(/Does NOT require PromoterVenueAccess/i.test(src));
  assert.ok(/REMOVED_BY_AUTHORIZED_PROMOTER/.test(src));
  assert.ok(/REVOKED/.test(src));
  assert.ok(/bookingRestrictionMode:\s*"NONE"/.test(src) || /bookingRestrictionMode: "NONE"/.test(src));
  assert.ok(!/hard.?delete venue/i.test(src));
}

// Confirmation + success copy
{
  const confirm = fs.readFileSync(
    path.join(__dirname, "../src/app/promoter/open-mics/[listingSlug]/remove/page.tsx"),
    "utf8",
  );
  const done = fs.readFileSync(
    path.join(__dirname, "../src/app/promoter/open-mics/[listingSlug]/removed/page.tsx"),
    "utf8",
  );
  assert.ok(/Remove this open mic from MicStage\?/i.test(confirm));
  assert.ok(/will not delete the venue/i.test(confirm));
  assert.ok(/MicStage account/i.test(confirm));
  assert.ok(/Remove my open mic/i.test(confirm));
  assert.ok(/Keep my open mic/i.test(confirm));
  assert.ok(/different from deleting your MicStage account/i.test(confirm));
  assert.ok(/Your open mic has been removed from MicStage/i.test(done));
  assert.ok(/no longer appear in MicStage search or maps/i.test(done));
  assert.ok(/h-12/.test(confirm), "mobile-friendly button height");
  assert.ok(/w-full/.test(confirm), "full-width mobile CTAs");
}

// Dashboard surfaces remove without requiring venue ownership
{
  const dash = fs.readFileSync(path.join(__dirname, "../src/app/promoter/page.tsx"), "utf8");
  assert.ok(/listRemovableOpenMicsForPromoter/.test(dash));
  assert.ok(/Remove this open mic/.test(dash));
  assert.ok(/Your open mics on MicStage/.test(dash));
}

// Claim eligibility excludes removed listings
{
  const elig = fs.readFileSync(path.join(__dirname, "../src/lib/publicListings/claimInviteEligibility.ts"), "utf8");
  assert.ok(/removedAt:\s*null/.test(elig));
  const tokens = fs.readFileSync(path.join(__dirname, "../src/lib/publicListings/claimInviteToken.ts"), "utf8");
  assert.ok(/removedAt/.test(tokens));
  assert.ok(/verificationStatus !== "VERIFIED"/.test(tokens));
}

// Discovery gate still uses OUTDATED (removal sets it)
{
  const removal = fs.readFileSync(path.join(__dirname, "../src/lib/publicListings/openMicSelfRemoval.ts"), "utf8");
  assert.ok(/verificationStatus:\s*"OUTDATED"/.test(removal));
  assert.ok(/isActive:\s*false/.test(removal));
}

console.log(JSON.stringify({ ok: true, checks: "open-mic self-removal unit checks passed" }));
