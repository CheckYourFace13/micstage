/**
 * Verify public open mic listings against Google Business / Places.
 *
 * Usage: node scripts/verify-public-listings-google.mjs [--limit=50] [--dry-run]
 * Requires GOOGLE_MAPS_SERVER_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY with Places API enabled.
 */
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "";

if (!url) {
  console.error("No DATABASE_URL — set $env:DATABASE_URL in PowerShell or add .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 50;

function googleKey() {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

// Keep in sync with src/lib/publicListings/openMicEvidence.ts
const OPEN_MIC_EVIDENCE_REASON = {
  CONFIRMED: "EXPLICIT_OPEN_MIC_EVIDENCE_CONFIRMED",
  PLACE_ONLY: "GOOGLE_PLACE_CONFIRMED_OPEN_MIC_EVIDENCE_MISSING",
};

const EXPLICIT_OPEN_MIC_PATTERN =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen[\s-]?mic\s*(?:night|signup|sign[\s-]?up)\b)|(\bopen\s+jam\b)|(\bopen\s+blues\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bsongwriter\s+(?:open\s*mic|night)\b)|(\bspoken\s+word\s+open\s*mic\b)/i;

function explicitOpenMicMatch(text) {
  if (!text) return null;
  const m = EXPLICIT_OPEN_MIC_PATTERN.exec(text);
  return m ? m[0].trim() : null;
}

// Reliable, venue-tied evidence lives in the listing NAME and real SCHEDULE
// titles/descriptions. `about` and raw discovery snippets are excluded (they
// contain "open mic" boilerplate for every live-event lead).
function detectOpenMicEvidence(listing) {
  const nameMatch = explicitOpenMicMatch(listing.name);
  if (nameMatch) return { hasEvidence: true, source: "name", snippet: nameMatch };
  for (const s of listing.schedules ?? []) {
    const m = explicitOpenMicMatch(s.title) ?? explicitOpenMicMatch(s.description);
    if (m) return { hasEvidence: true, source: "schedule", snippet: m };
  }
  return { hasEvidence: false, source: null, snippet: null };
}

const NON_VENUE_TYPES = new Set([
  "locality",
  "political",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
  "route",
  "street_address",
  "postal_code",
  "neighborhood",
]);

const VENUE_TYPES = new Set([
  "bar",
  "night_club",
  "restaurant",
  "cafe",
  "establishment",
  "point_of_interest",
  "art_gallery",
  "church",
]);

function normalizeName(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|llc|inc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchScore(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const ta = na.split(" ").filter((t) => t.length > 2);
  const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (!ta.length || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.length, tb.size);
}

function parseAddressComponents(components) {
  if (!components?.length) return {};
  const get = (type) =>
    components.find((c) => c.types?.includes(type))?.short_name ??
    components.find((c) => c.types?.includes(type))?.long_name;
  return {
    city: get("locality") ?? get("postal_town") ?? get("administrative_area_level_2"),
    region: get("administrative_area_level_1"),
  };
}

function classifyTypes(types) {
  if (!types?.length) return "unknown";
  if (types.some((t) => NON_VENUE_TYPES.has(t)) && !types.some((t) => VENUE_TYPES.has(t))) return "non_venue";
  if (types.some((t) => VENUE_TYPES.has(t))) return "venue";
  return "unknown";
}

function buildQuery(listing) {
  const city = listing.city?.trim();
  const region = listing.region?.trim();
  if (city && region) return `${listing.name}, ${city}, ${region}`;
  if (city) return `${listing.name}, ${city}`;
  return listing.formattedAddress?.trim() || listing.name;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function textSearch(query, key) {
  const u = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=us&key=${encodeURIComponent(key)}`;
  const res = await fetch(u);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("Places text search:", data.status, data.error_message ?? "");
    return null;
  }
  return data.results?.[0] ?? null;
}

async function placeDetails(placeId, key) {
  const fields = "place_id,name,formatted_address,geometry,types,business_status,website,address_components";
  const u = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${encodeURIComponent(key)}`;
  const res = await fetch(u);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status && data.status !== "OK") {
    console.warn("Places details:", data.status, data.error_message ?? "");
    return null;
  }
  return data.result ?? null;
}

function evaluate(listing, place) {
  const placeName = place.name?.trim() ?? "";
  const matchScore = nameMatchScore(listing.name, placeName);
  const typeClass = classifyTypes(place.types);
  const addr = parseAddressComponents(place.address_components);

  if (place.business_status === "CLOSED_PERMANENTLY") {
    return { outcome: "outdated", reason: "Permanently closed on Google", matchScore, place };
  }
  if (typeClass === "non_venue") {
    return { outcome: "outdated", reason: `Not a business (${(place.types ?? []).slice(0, 3).join(", ")})`, matchScore, place };
  }
  if (matchScore < 0.45) {
    return { outcome: "needs_review", reason: `Weak match (${Math.round(matchScore * 100)}%): "${placeName}"`, matchScore, place };
  }

  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (!place.place_id || !place.formatted_address || lat == null || lng == null) {
    return { outcome: "needs_review", reason: "Missing Google coordinates", matchScore, place };
  }

  return {
    outcome: matchScore >= 0.65 ? "verified" : "needs_review",
    reason:
      matchScore >= 0.65
        ? `Matched "${placeName}" (${Math.round(matchScore * 100)}%)`
        : `Possible match "${placeName}" (${Math.round(matchScore * 100)}%)`,
    matchScore,
    place,
  };
}

function noteLine(existing, reason) {
  const line = `[${new Date().toISOString().slice(0, 10)}] Google verify: ${reason}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

async function placeIdInUseByOther(prisma, placeId, rowId) {
  if (!placeId) return null;
  return prisma.publicOpenMicListing.findFirst({
    where: { googlePlaceId: placeId, NOT: { id: rowId } },
    select: { slug: true },
  });
}

const key = googleKey();
if (!key) {
  console.error("No Google Maps API key — set GOOGLE_MAPS_SERVER_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const rows = await prisma.publicOpenMicListing.findMany({
    where: {
      claimedVenueId: null,
      verificationStatus: { not: "OUTDATED" },
      OR: [{ googlePlaceId: null }, { googlePlaceVerifiedAt: null }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      formattedAddress: true,
      googlePlaceId: true,
      websiteUrl: true,
      verificationStatus: true,
      internalNotes: true,
      schedules: { select: { title: true, description: true } },
    },
    orderBy: [{ googlePlaceVerifiedAt: "asc" }, { updatedAt: "desc" }],
    take: Number.isFinite(limit) ? limit : 50,
  });

  let verified = 0;
  let needsReview = 0;
  let outdated = 0;

  for (const row of rows) {
    let place = row.googlePlaceId ? await placeDetails(row.googlePlaceId, key) : null;
    if (!place) {
      place = await textSearch(buildQuery(row), key);
      if (place?.place_id) {
        const detailed = await placeDetails(place.place_id, key);
        if (detailed) place = detailed;
      }
    }

    if (!place) {
      console.log("no_match", row.slug, row.name);
      if (!dryRun) {
        await prisma.publicOpenMicListing.update({
          where: { id: row.id },
          data: {
            lastVerifiedAt: new Date(),
            internalNotes: noteLine(row.internalNotes, "No Google Business listing found"),
          },
        });
      }
      needsReview += 1;
      await sleep(300);
      continue;
    }

    const result = evaluate(row, place);
    const evidence = result.outcome === "verified" ? detectOpenMicEvidence(row) : null;
    const projected =
      result.outcome === "verified" && !evidence?.hasEvidence
        ? "needs_review (place only, no open mic evidence)"
        : result.outcome;
    console.log(dryRun ? "[dry-run]" : projected, row.slug, result.reason);

    if (dryRun) {
      if (result.outcome === "verified" && evidence?.hasEvidence) verified += 1;
      else if (result.outcome === "outdated") outdated += 1;
      else needsReview += 1;
      await sleep(300);
      continue;
    }

    if (result.outcome === "outdated") {
      await prisma.publicOpenMicListing.update({
        where: { id: row.id },
        data: {
          verificationStatus: "OUTDATED",
          lastVerifiedAt: new Date(),
          internalNotes: noteLine(row.internalNotes, result.reason),
        },
      });
      outdated += 1;
    } else if (result.outcome === "verified") {
      const dup = await placeIdInUseByOther(prisma, result.place.place_id, row.id);
      if (dup) {
        await prisma.publicOpenMicListing.update({
          where: { id: row.id },
          data: {
            verificationStatus: "NEEDS_REVIEW",
            lastVerifiedAt: new Date(),
            internalNotes: noteLine(row.internalNotes, `Duplicate Google place (${dup.slug})`),
          },
        });
        needsReview += 1;
      } else {
        const addr = parseAddressComponents(result.place.address_components);
        // Save place fields + coordinates either way, but only publish (VERIFIED)
        // when there is explicit open-mic evidence tied to the listing.
        const placeData = {
          googlePlaceId: result.place.place_id,
          googlePlaceVerifiedAt: new Date(),
          lastVerifiedAt: new Date(),
          formattedAddress: result.place.formatted_address,
          lat: result.place.geometry.location.lat,
          lng: result.place.geometry.location.lng,
          city: addr.city ?? row.city,
          region: addr.region ?? row.region,
          websiteUrl: row.websiteUrl?.trim() ? row.websiteUrl : result.place.website ?? row.websiteUrl,
        };
        if (evidence?.hasEvidence) {
          await prisma.publicOpenMicListing.update({
            where: { id: row.id },
            data: {
              ...placeData,
              verificationStatus: "VERIFIED",
              internalNotes: noteLine(
                row.internalNotes,
                `${result.reason}; ${OPEN_MIC_EVIDENCE_REASON.CONFIRMED} (${evidence.source}: "${evidence.snippet}")`,
              ),
            },
          });
          verified += 1;
        } else {
          await prisma.publicOpenMicListing.update({
            where: { id: row.id },
            data: {
              ...placeData,
              verificationStatus: "NEEDS_REVIEW",
              internalNotes: noteLine(
                row.internalNotes,
                `${result.reason}; ${OPEN_MIC_EVIDENCE_REASON.PLACE_ONLY}`,
              ),
            },
          });
          needsReview += 1;
        }
      }
    } else {
      const placeId = result.place.place_id ?? null;
      const dup = await placeIdInUseByOther(prisma, placeId, row.id);
      const data = {
        verificationStatus: row.verificationStatus === "VERIFIED" ? "NEEDS_REVIEW" : row.verificationStatus,
        lastVerifiedAt: new Date(),
        internalNotes: noteLine(
          row.internalNotes,
          dup ? `${result.reason}; duplicate Google place (${dup.slug})` : result.reason,
        ),
      };
      if (placeId && !dup) {
        data.googlePlaceId = placeId;
        data.googlePlaceVerifiedAt = new Date();
      }
      await prisma.publicOpenMicListing.update({ where: { id: row.id }, data });
      needsReview += 1;
    }

    await sleep(300);
  }

  console.log(JSON.stringify({ ok: true, dryRun, scanned: rows.length, verified, needsReview, outdated }, null, 2));
} finally {
  await prisma.$disconnect();
}
