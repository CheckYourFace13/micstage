/**
 * Self-service open-mic removal for authorized promoters / venue owners.
 * Soft-removes the public listing without deleting venues or accounts.
 * Does NOT require PromoterVenueAccess for unclaimed listings the promoter produces.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const OPEN_MIC_REMOVAL_REASON = {
  PROMOTER: "REMOVED_BY_AUTHORIZED_PROMOTER",
  VENUE_OWNER: "REMOVED_BY_VENUE_OWNER",
} as const;

const GENERIC_SERIES = new Set([
  "open mic",
  "open mike",
  "open jam",
  "open stage",
  "open mic night",
  "jam night",
]);

function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinctive series/brand names only — blocks bare "open mic". */
export function isDistinctiveOpenMicBrand(name: string | null | undefined): boolean {
  const n = norm(name);
  if (n.length < 8) return false;
  if (GENERIC_SERIES.has(n)) return false;
  // Prefer versioned / branded series (e.g. "open mic 2 0") or multi-token brands.
  const tokens = n.split(" ").filter(Boolean);
  if (tokens.length >= 3) return true;
  if (/\d/.test(n)) return true;
  if (tokens.length === 2 && tokens[0] === "open" && tokens[1] === "mic") return false;
  return tokens.length >= 2 && !GENERIC_SERIES.has(n);
}

function listingSearchBlob(listing: {
  name: string;
  about?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  region?: string | null;
  schedules?: Array<{ title: string | null; description: string | null }>;
}): string {
  const sched = (listing.schedules ?? [])
    .map((s) => [s.title, s.description].filter(Boolean).join(" "))
    .join(" ");
  return norm(
    [listing.name, listing.about, listing.formattedAddress, listing.city, listing.region, sched]
      .filter(Boolean)
      .join(" "),
  );
}

function brandAppearsInListing(brand: string, blob: string): boolean {
  const b = norm(brand);
  if (!isDistinctiveOpenMicBrand(b)) return false;
  return blob.includes(b);
}

function venueCueMatches(
  notes: string | null | undefined,
  cityRegion: string | null | undefined,
  listing: { name: string; formattedAddress: string; city: string | null; region: string | null },
): boolean {
  const blob = norm(`${listing.name} ${listing.formattedAddress} ${listing.city} ${listing.region}`);
  const cues = norm(`${notes || ""} ${cityRegion || ""}`);
  if (!cues) return false;
  // Common venue tokens from application notes
  const venueWords = cues
    .split(" ")
    .filter((w) => w.length >= 4)
    .filter((w) => !["weekly", "friday", "fridays", "thursday", "saturday", "sunday", "monday", "night", "open"].includes(w));
  let hits = 0;
  for (const w of venueWords) {
    if (blob.includes(w)) hits += 1;
  }
  if (hits >= 2) return true;
  // "fox" + "hound" style
  if (blob.includes("fox") && blob.includes("hound") && (cues.includes("fox") || cues.includes("hound"))) {
    return true;
  }
  const city = norm(listing.city);
  const regionCue = norm(cityRegion);
  if (city && regionCue.includes(city)) return true;
  if (listing.region && regionCue.includes(norm(listing.region))) return true;
  return false;
}

export type RemovableOpenMic = {
  listingId: string;
  listingSlug: string;
  listingName: string;
  placeLine: string | null;
  authorization: "series" | "application" | "venue_access" | "venue_owner";
};

export async function listRemovableOpenMicsForPromoter(
  prisma: PrismaClient,
  promoterId: string,
): Promise<RemovableOpenMic[]> {
  const promoter = await prisma.promoterUser.findUnique({
    where: { id: promoterId },
    select: {
      id: true,
      application: {
        select: { status: true, brandName: true, notes: true, cityRegion: true },
      },
      series: {
        where: { archivedAt: null },
        select: { id: true, name: true },
      },
      venueAccess: {
        where: { status: "APPROVED" },
        select: {
          venue: {
            select: {
              id: true,
              claimedFromListing: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  formattedAddress: true,
                  city: true,
                  region: true,
                  verificationStatus: true,
                  removedAt: true,
                  about: true,
                  schedules: { select: { title: true, description: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!promoter) return [];

  const out: RemovableOpenMic[] = [];
  const seen = new Set<string>();

  const push = (row: RemovableOpenMic) => {
    if (seen.has(row.listingId)) return;
    seen.add(row.listingId);
    out.push(row);
  };

  // Approved venue access → claimed listing
  for (const a of promoter.venueAccess) {
    const l = a.venue.claimedFromListing;
    if (!l || l.removedAt || l.verificationStatus === "OUTDATED") continue;
    push({
      listingId: l.id,
      listingSlug: l.slug,
      listingName: l.name,
      placeLine: l.formattedAddress || [l.city, l.region].filter(Boolean).join(", ") || null,
      authorization: "venue_access",
    });
  }

  // Unclaimed public listings matching series / approved application
  const nameFilters: Array<{ name: { contains: string; mode: "insensitive" } }> = [];
  for (const s of promoter.series) {
    if (isDistinctiveOpenMicBrand(s.name)) {
      nameFilters.push({ name: { contains: s.name.slice(0, 40), mode: "insensitive" } });
    }
  }
  if (promoter.application?.brandName && isDistinctiveOpenMicBrand(promoter.application.brandName)) {
    nameFilters.push({
      name: { contains: promoter.application.brandName.slice(0, 40), mode: "insensitive" },
    });
  }

  if (nameFilters.length > 0) {
    const candidateListings = await prisma.publicOpenMicListing.findMany({
      where: {
        removedAt: null,
        verificationStatus: { not: "OUTDATED" },
        claimedVenueId: null,
        OR: nameFilters,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        about: true,
        formattedAddress: true,
        city: true,
        region: true,
        verificationStatus: true,
        schedules: { select: { title: true, description: true } },
      },
      take: 40,
    });

    for (const l of candidateListings) {
      const auth = evaluatePromoterListingAuthorization(promoter, l);
      if (!auth) continue;
      push({
        listingId: l.id,
        listingSlug: l.slug,
        listingName: l.name,
        placeLine: l.formattedAddress || [l.city, l.region].filter(Boolean).join(", ") || null,
        authorization: auth,
      });
    }
  }

  return out;
}

export function evaluatePromoterListingAuthorization(
  promoter: {
    application: { status: string; brandName: string | null; notes: string | null; cityRegion: string | null } | null;
    series: Array<{ name: string }>;
  },
  listing: {
    name: string;
    about?: string | null;
    formattedAddress: string;
    city: string | null;
    region: string | null;
    schedules?: Array<{ title: string | null; description: string | null }>;
  },
): "series" | "application" | null {
  const blob = listingSearchBlob(listing);

  for (const s of promoter.series) {
    if (brandAppearsInListing(s.name, blob)) return "series";
  }

  const app = promoter.application;
  if (app?.status === "APPROVED" && app.brandName && brandAppearsInListing(app.brandName, blob)) {
    if (venueCueMatches(app.notes, app.cityRegion, listing)) return "application";
    // Brand alone is enough when brand is highly distinctive and embedded in listing name
    if (norm(listing.name).includes(norm(app.brandName))) return "application";
  }

  return null;
}

export async function assertPromoterCanRemoveListing(
  prisma: PrismaClient,
  promoterId: string,
  listingSlug: string,
): Promise<{ ok: true; listingId: string; listingName: string } | { ok: false; error: string }> {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: listingSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      about: true,
      formattedAddress: true,
      city: true,
      region: true,
      removedAt: true,
      verificationStatus: true,
      claimedVenueId: true,
      schedules: { select: { title: true, description: true } },
    },
  });
  if (!listing || listing.removedAt || listing.verificationStatus === "OUTDATED") {
    return { ok: false, error: "not_found" };
  }

  const removable = await listRemovableOpenMicsForPromoter(prisma, promoterId);
  const hit = removable.find((r) => r.listingId === listing.id);
  if (!hit) return { ok: false, error: "forbidden" };

  return { ok: true, listingId: listing.id, listingName: listing.name };
}

export async function assertVenueOwnerCanRemoveListing(
  prisma: PrismaClient,
  venueOwnerId: string,
  listingSlug: string,
): Promise<{ ok: true; listingId: string; listingName: string } | { ok: false; error: string }> {
  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { slug: listingSlug },
    select: {
      id: true,
      name: true,
      removedAt: true,
      verificationStatus: true,
      claimedVenueId: true,
      claimedVenue: { select: { ownerId: true } },
    },
  });
  if (!listing || listing.removedAt || listing.verificationStatus === "OUTDATED") {
    return { ok: false, error: "not_found" };
  }
  if (!listing.claimedVenueId || listing.claimedVenue?.ownerId !== venueOwnerId) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, listingId: listing.id, listingName: listing.name };
}

export type RemoveOpenMicResult =
  | { ok: true; listingId: string; listingName: string; tokensRevoked: number }
  | { ok: false; error: string; status: number };

/**
 * Soft-remove a public open mic. Preserves venue + accounts + evidence history.
 * Revokes ACTIVE claim tokens so old links cannot silently restore the listing.
 */
export async function removeOpenMicListing(opts: {
  prisma: PrismaClient;
  listingId: string;
  actor: { kind: "promoter"; promoterId: string } | { kind: "venue_owner"; venueOwnerId: string };
  reasonCode: (typeof OPEN_MIC_REMOVAL_REASON)[keyof typeof OPEN_MIC_REMOVAL_REASON];
}): Promise<RemoveOpenMicResult> {
  const { prisma, listingId, actor, reasonCode } = opts;
  const now = new Date();

  const listing = await prisma.publicOpenMicListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      name: true,
      slug: true,
      removedAt: true,
      verificationStatus: true,
      internalNotes: true,
      claimedVenueId: true,
    },
  });
  if (!listing || listing.removedAt || listing.verificationStatus === "OUTDATED") {
    return { ok: false, error: "This open mic is already removed.", status: 404 };
  }

  const stamp = `[${now.toISOString().slice(0, 10)}] ${reasonCode} by ${actor.kind}:${
    actor.kind === "promoter" ? actor.promoterId : actor.venueOwnerId
  }`;

  const revoked = await prisma.$transaction(async (tx) => {
    await tx.publicOpenMicListing.update({
      where: { id: listing.id },
      data: {
        verificationStatus: "OUTDATED",
        removedAt: now,
        evidenceTerminalReason: reasonCode,
        claimStatus: listing.claimedVenueId ? undefined : "UNCLAIMED",
        lastVerifiedAt: now,
        internalNotes: [listing.internalNotes, stamp].filter(Boolean).join("\n"),
      },
      select: { id: true },
    });

    await tx.publicOpenMicSchedule.updateMany({
      where: { listingId: listing.id, isActive: true },
      data: { isActive: false },
    });

    const tokenRes = await tx.listingClaimInviteToken.updateMany({
      where: { listingId: listing.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });

    await tx.listingClaimAuditEvent.create({
      data: {
        listingId: listing.id,
        eventType: "OPEN_MIC_REMOVED",
        meta: {
          reasonCode,
          actorKind: actor.kind,
          // never store emails
          listingSlug: listing.slug,
          tokensRevoked: tokenRes.count,
        },
      },
    });

    if (actor.kind === "promoter") {
      const series = await tx.promoterSeries.findMany({
        where: { promoterId: actor.promoterId, archivedAt: null },
        select: { id: true, name: true },
      });
      const blob = norm(listing.name);
      for (const s of series) {
        if (brandAppearsInListing(s.name, blob) || (isDistinctiveOpenMicBrand(s.name) && blob.includes(norm(s.name)))) {
          await tx.promoterSeries.update({
            where: { id: s.id },
            data: { archivedAt: now },
          });
        }
      }
    }

    // If claimed: turn off future public booking on the venue without deleting it.
    if (listing.claimedVenueId) {
      await tx.venue.update({
        where: { id: listing.claimedVenueId },
        data: { bookingRestrictionMode: "NONE" },
      });
      await tx.eventTemplate.updateMany({
        where: { venueId: listing.claimedVenueId, isPublic: true },
        data: { isPublic: false },
      });
    }

    return tokenRes.count;
  });

  return {
    ok: true,
    listingId: listing.id,
    listingName: listing.name,
    tokensRevoked: revoked,
  };
}
