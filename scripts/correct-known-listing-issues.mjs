/**
 * Read-only / dry-run / apply for known production listing corrections.
 * Usage:
 *   node scripts/correct-known-listing-issues.mjs --dry-run
 *   node scripts/correct-known-listing-issues.mjs --apply
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
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

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function redact(e) {
  if (!e) return null;
  const at = e.indexOf("@");
  return `${e.slice(0, 1)}***@${e.slice(at + 1)}`;
}
function hashId(id) {
  return createHash("sha256").update(String(id)).digest("hex").slice(0, 12);
}
function hostFromUrl(u) {
  if (!u?.trim()) return null;
  try {
    return new URL(u.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

function appendNote(existing, note) {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] ${note}`;
  if (!existing?.trim()) return line;
  if (existing.includes(note)) return existing;
  return `${existing.trim()}\n${line}`;
}

try {
  // --- A. Area 51 ---
  const area51 = await prisma.publicOpenMicListing.findFirst({
    where: {
      OR: [
        { slug: { contains: "area-51" } },
        { name: { contains: "Area 51", mode: "insensitive" } },
        { slug: { contains: "roswell" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      country: true,
      formattedAddress: true,
      lat: true,
      lng: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      verificationStatus: true,
      claimStatus: true,
      internalNotes: true,
      claimInviteEmailSentAt: true,
      claimInviteEmail: true,
      lastVerifiedAt: true,
      schedules: { select: { id: true, weekday: true, startTimeMin: true, title: true } },
      claimRequests: { select: { id: true, status: true, email: true } },
      growthLead: {
        select: {
          id: true,
          discoveryMarketSlug: true,
          sourceKind: true,
          websiteUrl: true,
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          city: true,
          region: true,
          name: true,
          openMicSignalTier: true,
        },
      },
    },
  });

  let area51Plan = null;
  if (area51) {
    const nameSaysGA = /roswell\s*ga|\broswell\b.*georgia|georgia/i.test(
      `${area51.name} ${area51.formattedAddress}`,
    );
    const regionIL = (area51.region || "").toUpperCase() === "IL";
    const marketIL = /illinois|chicago/i.test(area51.growthLead?.discoveryMarketSlug || "");
    const siteHost = hostFromUrl(area51.websiteUrl) || hostFromUrl(area51.sourceUrl);
    const emailHost = area51.growthLead?.contactEmailNormalized?.split("@")[1] || null;
    const domainLooksGA = /roswell/i.test(siteHost || "") || /roswell/i.test(emailHost || "");
    const hasCoords = area51.lat != null && area51.lng != null;
    const placeId = area51.googlePlaceId;

    // Heuristic: conflicting IL region/market with GA naming + roswell365 domain → do not keep VERIFIED
    const conflict = (regionIL || marketIL) && (nameSaysGA || domainLooksGA);
    const canCorrectToGA =
      nameSaysGA &&
      domainLooksGA &&
      placeId &&
      // Only correct if we have strong GA signals AND no IL coords near Chicago
      !(hasCoords && area51.lat > 41 && area51.lat < 43 && area51.lng < -86 && area51.lng > -89);

    // Without Place Details API in this script, prefer demote over blind GA correction when coords/place unverified against IL.
    // Safest: demote VERIFIED → NEEDS_REVIEW with PLACE_OR_REGION_CONFLICT unless we can prove GA place.
    const disposition = conflict
      ? {
          action: "DEMOTE_NEEDS_REVIEW",
          reason: "PLACE_OR_REGION_CONFLICT",
          note: "PLACE_OR_REGION_CONFLICT: listing name/source indicate Roswell GA (roswell365.com) but region/market are IL/Chicagoland; lat/lng missing or unverified. Demoted from VERIFIED until place/region reconciled. Removed from claim eligibility.",
          set: {
            verificationStatus: "NEEDS_REVIEW",
            // Do not clear googlePlaceId — preserve for investigation
            city: area51.city, // leave; correcting without Place Details risks inventing data
            region: area51.region,
          },
        }
      : { action: "NO_CHANGE", reason: "no_conflict_detected" };

    area51Plan = {
      listingIdHash: hashId(area51.id),
      slug: area51.slug,
      current: {
        verificationStatus: area51.verificationStatus,
        city: area51.city,
        region: area51.region,
        country: area51.country,
        formattedAddress: area51.formattedAddress?.slice(0, 120),
        lat: area51.lat,
        lng: area51.lng,
        googlePlaceId: placeId,
        websiteUrl: area51.websiteUrl,
        sourceUrl: area51.sourceUrl,
        market: area51.growthLead?.discoveryMarketSlug,
        emailRedacted: redact(area51.growthLead?.contactEmailNormalized),
        confidence: area51.growthLead?.contactEmailConfidence,
        siteHost,
        emailHost,
        schedules: area51.schedules.length,
        claimInviteSent: Boolean(area51.claimInviteEmailSentAt),
      },
      signals: { nameSaysGA, regionIL, marketIL, domainLooksGA, hasCoords, conflict, canCorrectToGA },
      disposition,
      whyNotCorrectInPlace:
        "Correcting region to GA without Place Details confirmation of the stored googlePlaceId could invent geography. Demote first; re-verify place separately.",
    };

    if (apply && disposition.action === "DEMOTE_NEEDS_REVIEW") {
      await prisma.publicOpenMicListing.update({
        where: { id: area51.id },
        data: {
          verificationStatus: "NEEDS_REVIEW",
          internalNotes: appendNote(area51.internalNotes, disposition.note),
        },
        select: { id: true, verificationStatus: true },
      });
      area51Plan.applied = true;
    }
  }

  // --- B. Gallery Cabaret ---
  const gallery = await prisma.publicOpenMicListing.findFirst({
    where: {
      OR: [
        { slug: { contains: "gallery-cabaret" } },
        { name: { contains: "Gallery Cabaret", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      websiteUrl: true,
      sourceUrl: true,
      verificationStatus: true,
      claimStatus: true,
      internalNotes: true,
      lastVerifiedAt: true,
      claimInviteEmail: true,
      schedules: { select: { id: true } },
      claimRequests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          role: true,
          email: true,
          proofUrl: true,
          notes: true,
          createdAt: true,
          desiredLoginEmail: true,
        },
      },
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
          openMicSignalTier: true,
        },
      },
    },
  });

  let galleryPlan = null;
  if (gallery) {
    const claims = gallery.claimRequests;
    const notesSayEnded2015 = claims.some((c) => /2015|stopped hosting|no longer|ended/i.test(c.notes || ""));
    const inviteEmail = gallery.claimInviteEmail?.toLowerCase() || null;
    galleryPlan = {
      listingIdHash: hashId(gallery.id),
      slug: gallery.slug,
      current: {
        verificationStatus: gallery.verificationStatus,
        claimStatus: gallery.claimStatus,
        city: gallery.city,
        region: gallery.region,
        websiteUrl: gallery.websiteUrl,
        sourceUrl: gallery.sourceUrl,
        lastVerifiedAt: gallery.lastVerifiedAt,
        schedules: gallery.schedules.length,
        inviteEmailRedacted: redact(inviteEmail),
      },
      claims: claims.map((c) => ({
        idHash: hashId(c.id),
        status: c.status,
        role: c.role,
        emailRedacted: redact(c.email),
        inviteMatch: inviteEmail ? inviteEmail === c.email.toLowerCase() : null,
        hasProof: Boolean(c.proofUrl),
        notesPreview: (c.notes || "").slice(0, 160),
        createdAt: c.createdAt,
      })),
      notesSayEnded2015,
      disposition: notesSayEnded2015
        ? {
            action: "DEMOTE_OUTDATED_AND_REJECT_CLAIMS",
            listingStatus: "OUTDATED",
            claimStatus: "REJECTED",
            reviewNote:
              "Claimant stated the Gallery Cabaret poetry mic stopped in 2015; no credible current open-mic evidence on file. Listing demoted OUTDATED. Claims rejected without account creation. Duplicate claim preserved as REJECTED with duplicate note.",
          }
        : { action: "MANUAL_REVIEW", reason: "2015_end_not_found_in_notes" },
    };

    if (apply && galleryPlan.disposition.action === "DEMOTE_OUTDATED_AND_REJECT_CLAIMS") {
      await prisma.$transaction(async (tx) => {
        await tx.publicOpenMicListing.update({
          where: { id: gallery.id },
          data: {
            verificationStatus: "OUTDATED",
            claimStatus: "UNCLAIMED",
            internalNotes: appendNote(
              gallery.internalNotes,
              "OUTDATED: claimant reported poetry open mic ended 2015; no current trusted evidence. Claims rejected.",
            ),
          },
          select: { id: true },
        });
        let i = 0;
        for (const c of claims) {
          i += 1;
          const dupNote = i > 1 ? " Duplicate of earlier pending claim for same listing." : "";
          await tx.listingClaimRequest.update({
            where: { id: c.id },
            data: {
              status: "REJECTED",
              reviewedAt: new Date(),
              reviewedByEmail: "system:data-correction",
              reviewNotes: galleryPlan.disposition.reviewNote + dupNote,
            },
            select: { id: true },
          });
        }
      });
      galleryPlan.applied = true;
    }
  }

  // --- C. BOOKCLUB ---
  const bookclub = await prisma.publicOpenMicListing.findFirst({
    where: {
      OR: [{ slug: "bookclub-chicago" }, { name: { equals: "BOOKCLUB", mode: "insensitive" } }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      region: true,
      websiteUrl: true,
      sourceUrl: true,
      googlePlaceId: true,
      verificationStatus: true,
      claimStatus: true,
      schedules: { select: { id: true, weekday: true } },
      claimRequests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          role: true,
          email: true,
          proofUrl: true,
          notes: true,
          desiredLoginEmail: true,
          createdAt: true,
        },
      },
      growthLead: {
        select: {
          contactEmailNormalized: true,
          contactEmailConfidence: true,
          websiteUrl: true,
          discoveryMarketSlug: true,
          openMicSignalTier: true,
          name: true,
        },
      },
    },
  });

  let bookclubPlan = null;
  if (bookclub) {
    const claim = bookclub.claimRequests.find((c) => c.status === "PENDING") || bookclub.claimRequests[0];
    const claimEmail = claim?.email?.toLowerCase() || null;
    const claimHost = claimEmail?.split("@")[1] || null;
    const siteHost =
      hostFromUrl(bookclub.websiteUrl) ||
      hostFromUrl(bookclub.growthLead?.websiteUrl) ||
      hostFromUrl(bookclub.sourceUrl);
    const domainMatch =
      claimHost && siteHost
        ? claimHost === siteHost || claimHost.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${claimHost}`)
        : false;

    const existingOwner = claimEmail
      ? await prisma.venueOwner.findUnique({ where: { email: claimEmail }, select: { id: true } })
      : null;
    const existingVenueByPlace = bookclub.googlePlaceId
      ? await prisma.venue.findUnique({
          where: { googlePlaceId: bookclub.googlePlaceId },
          select: { id: true, slug: true, ownerId: true },
        })
      : null;

    let classification = "MANUAL_AUTHORITY_REVIEW";
    const reasons = [];
    if (bookclub.verificationStatus !== "VERIFIED") {
      reasons.push(`listing_${bookclub.verificationStatus}`);
      classification = "MANUAL_AUTHORITY_REVIEW";
    }
    if (!bookclub.googlePlaceId) reasons.push("missing_google_place");
    if (!domainMatch) {
      reasons.push("claimant_domain_mismatch_or_unknown");
      classification = "MANUAL_AUTHORITY_REVIEW";
    }
    if (existingVenueByPlace) {
      reasons.push("place_already_on_venue");
      classification = "DUPLICATE_OR_CONFLICT";
    }
    if (
      bookclub.verificationStatus === "VERIFIED" &&
      domainMatch &&
      claim?.role &&
      /owner|manager/i.test(claim.role) &&
      claim.proofUrl &&
      !existingVenueByPlace
    ) {
      classification = "STRONG_CLAIM_CANDIDATE";
      reasons.push("verified_listing", "domain_match", "proof_url", "owner_role");
    }
    if (bookclub.verificationStatus === "OUTDATED") classification = "INVALID_OR_OUTDATED";

    bookclubPlan = {
      listingIdHash: hashId(bookclub.id),
      slug: bookclub.slug,
      name: bookclub.name,
      verificationStatus: bookclub.verificationStatus,
      claimStatus: bookclub.claimStatus,
      city: bookclub.city,
      region: bookclub.region,
      googlePlaceId: bookclub.googlePlaceId,
      websiteUrl: bookclub.websiteUrl,
      siteHost,
      claim: claim
        ? {
            idHash: hashId(claim.id),
            status: claim.status,
            role: claim.role,
            emailRedacted: redact(claimEmail),
            claimHost,
            domainMatch,
            hasProofUrl: Boolean(claim.proofUrl),
            proofHost: hostFromUrl(claim.proofUrl),
            desiredLoginRedacted: redact(claim.desiredLoginEmail),
            notesPreview: (claim.notes || "").slice(0, 120),
          }
        : null,
      existingOwner: Boolean(existingOwner),
      existingVenueByPlace: existingVenueByPlace
        ? { slug: existingVenueByPlace.slug, idHash: hashId(existingVenueByPlace.id) }
        : null,
      classification,
      reasons,
      nextStep:
        classification === "STRONG_CLAIM_CANDIDATE"
          ? "Preserve PENDING until instant-claim deploy; complete via new tokenized activation — do not use old admin venueSlug-only approve."
          : "Keep PENDING for manual authority review after deploy; do not approve via dead-end workflow.",
      applied: false,
      note: "No status mutation for BOOKCLUB in this script — assessment only.",
    };
  }

  const report = {
    ok: true,
    mode: dryRun ? "dry-run" : "apply",
    capturedAt: new Date().toISOString(),
    area51: area51Plan,
    galleryCabaret: galleryPlan,
    bookclub: bookclubPlan,
  };

  const outDir = "tmp/prod-baselines";
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `${outDir}/known-listing-corrections-${dryRun ? "dryrun" : "applied"}-${stamp}.json`;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, outPath }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
