/**
 * Read-only production growth snapshot for the maximization audit.
 * npx tsx scripts/audit-growth-maximization.mjs
 */
import fs from "node:fs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { listingMeetsPublicSeoIndexGate } from "../src/lib/publicListings/listingSeo.ts";
import { suggestedListingCityRegion } from "../src/lib/publicListings/evidenceTrust.ts";
import { readScheduleRecoveryDayStats } from "../src/lib/publicListings/listingScheduleEnrichment.ts";

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

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

try {
  const [
    verified,
    scheduled,
    unscheduled,
    schedulesAdded24h,
    rawToday,
    rawTotal,
    venues7,
    hosts7,
    performers7,
    guest24,
    digestOptIns,
    irving,
  ] = await Promise.all([
    prisma.publicOpenMicListing.count({ where: { verificationStatus: "VERIFIED", removedAt: null } }),
    prisma.publicOpenMicListing.count({
      where: { verificationStatus: "VERIFIED", removedAt: null, schedules: { some: { isActive: true } } },
    }),
    prisma.publicOpenMicListing.count({
      where: { verificationStatus: "VERIFIED", removedAt: null, schedules: { none: { isActive: true } } },
    }),
    prisma.publicOpenMicSchedule.count({ where: { createdAt: { gte: dayAgo }, isActive: true } }),
    prisma.growthLead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.growthLead.count(),
    prisma.venueOwner.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.promoterUser.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.musicianUser.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.booking.count({ where: { createdAt: { gte: dayAgo }, cancelledAt: null } }),
    prisma.musicianUser.count({ where: { weeklyNearbyOpenMicAlerts: true } }),
    prisma.publicOpenMicListing.findMany({
      where: {
        OR: [
          { name: { contains: "Irving Theater", mode: "insensitive" } },
          { name: { contains: "Indianapolis", mode: "insensitive" } },
          { slug: { contains: "irving", mode: "insensitive" } },
        ],
      },
      select: {
        slug: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        verificationStatus: true,
        removedAt: true,
        claimedVenueId: true,
      },
      take: 20,
    }),
  ]);

  const indexSample = await prisma.publicOpenMicListing.findMany({
    where: { verificationStatus: "VERIFIED", removedAt: null },
    select: {
      name: true,
      verificationStatus: true,
      formattedAddress: true,
      city: true,
      region: true,
      lastVerifiedAt: true,
      removedAt: true,
      sourceUrl: true,
      websiteUrl: true,
      schedules: { where: { isActive: true }, select: { title: true, description: true, performanceFormat: true } },
    },
  });
  const indexable = indexSample.filter((l) => listingMeetsPublicSeoIndexGate(l)).length;

  const geoWouldFix = [];
  const publicRows = await prisma.publicOpenMicListing.findMany({
    where: { claimedVenueId: null, removedAt: null, verificationStatus: "VERIFIED" },
    select: { name: true, city: true, region: true, formattedAddress: true, slug: true },
  });
  for (const l of publicRows) {
    const s = suggestedListingCityRegion(l);
    if (s && s.city.toLowerCase() !== (l.city || "").toLowerCase()) {
      geoWouldFix.push({ slug: l.slug, name: l.name, from: l.city, to: s.city, reason: s.reason });
    }
  }

  const recovery = await readScheduleRecoveryDayStats(prisma);

  const claimInvites24h = await prisma.listingClaimInviteToken.count({
    where: { createdAt: { gte: dayAgo } },
  }).catch(() => null);

  const [
    venues30,
    hosts30,
    performers30,
    guest7,
    guest30,
    bookings7,
    bookings30,
    claimInvites7,
    claimInvites30,
    claimsCompleted7,
    claimEvents7,
    claimEvents30,
    leadsBySourceKindToday,
    leadsBySourceKindTotal,
    leadsRejectedToday,
    leadsRejectedTotal,
    digestLastSent,
    uniqueCities,
    uniqueRegions,
    prairieMoon,
    suburbSample,
    outreachSent7,
    outreachDelivered7,
    outreachClicked7,
  ] = await Promise.all([
    prisma.venueOwner.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.promoterUser.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.musicianUser.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.booking.count({ where: { createdAt: { gte: weekAgo }, cancelledAt: null, musicianId: null } }),
    prisma.booking.count({ where: { createdAt: { gte: monthAgo }, cancelledAt: null, musicianId: null } }),
    prisma.booking.count({ where: { createdAt: { gte: weekAgo }, cancelledAt: null } }),
    prisma.booking.count({ where: { createdAt: { gte: monthAgo }, cancelledAt: null } }),
    prisma.listingClaimInviteToken.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.listingClaimInviteToken.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.listingClaimAuditEvent.count({
      where: { createdAt: { gte: weekAgo }, eventType: "CLAIM_COMPLETED" },
    }),
    prisma.listingClaimAuditEvent.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.listingClaimAuditEvent.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: monthAgo } },
      _count: { _all: true },
    }),
    prisma.growthLead.groupBy({
      by: ["sourceKind"],
      where: { createdAt: { gte: dayAgo } },
      _count: { _all: true },
    }),
    prisma.growthLead.groupBy({
      by: ["sourceKind"],
      _count: { _all: true },
    }),
    prisma.growthLead.count({ where: { status: "REJECTED", updatedAt: { gte: dayAgo } } }),
    prisma.growthLead.count({ where: { status: "REJECTED" } }),
    prisma.musicianUser.findMany({
      where: { weeklyNearbyOpenMicAlerts: true },
      select: { weeklyNearbyDigestLastSentAt: true },
    }),
    prisma.publicOpenMicListing.findMany({
      where: { verificationStatus: "VERIFIED", removedAt: null, city: { not: null } },
      select: { city: true, region: true, schedules: { where: { isActive: true }, select: { id: true } } },
    }),
    prisma.publicOpenMicListing.findMany({
      where: { verificationStatus: "VERIFIED", removedAt: null, region: { not: null } },
      select: { region: true },
      distinct: ["region"],
    }),
    prisma.publicOpenMicListing.findMany({
      where: {
        OR: [
          { slug: { contains: "prairie-moon", mode: "insensitive" } },
          { name: { contains: "Prairie Moon", mode: "insensitive" } },
          { name: { contains: "Old Republic", mode: "insensitive" } },
          { city: { contains: "Arlington Heights", mode: "insensitive" } },
          { formattedAddress: { contains: "Arlington Heights", mode: "insensitive" } },
          { city: { contains: "Evanston", mode: "insensitive" } },
        ],
      },
      select: {
        slug: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        verificationStatus: true,
        removedAt: true,
      },
      take: 30,
    }),
    prisma.publicOpenMicListing.findMany({
      where: {
        verificationStatus: "VERIFIED",
        removedAt: null,
        OR: [
          { city: { in: ["Evanston", "Arlington Heights", "Oak Park", "Naperville"] } },
          { name: { contains: "Evanston", mode: "insensitive" } },
        ],
      },
      select: { slug: true, name: true, city: true, region: true },
      take: 20,
    }),
    prisma.marketingEvent.count({ where: { type: "EMAIL_SENT", createdAt: { gte: weekAgo } } }),
    prisma.marketingEvent.count({ where: { type: "EMAIL_DELIVERED", createdAt: { gte: weekAgo } } }),
    prisma.marketingEvent.count({ where: { type: "EMAIL_CLICKED", createdAt: { gte: weekAgo } } }),
  ]);

  const cityMap = new Map();
  for (const row of uniqueCities) {
    const key = `${row.city}|${row.region ?? ""}`;
    const cur = cityMap.get(key) || { city: row.city, region: row.region, verified: 0, scheduled: 0 };
    cur.verified += 1;
    if (row.schedules.length > 0) cur.scheduled += 1;
    cityMap.set(key, cur);
  }
  const cityHubs = [...cityMap.values()].sort((a, b) => b.verified - a.verified).slice(0, 20);

  console.log(
    JSON.stringify(
      {
        verified,
        scheduled,
        unscheduled,
        indexable,
        schedulesAdded24h,
        rawToday,
        rawTotal,
        venues7,
        hosts7,
        performers7,
        venues30,
        hosts30,
        performers30,
        guestSignups24hApproxBookings: guest24,
        guest7,
        guest30,
        bookings7,
        bookings30,
        digestOptIns,
        digestSentEver: digestLastSent.filter((m) => m.weeklyNearbyDigestLastSentAt).length,
        scheduleRecovery: recovery,
        claimInvitesCreated24h: claimInvites24h,
        claimInvites7,
        claimInvites30,
        claimsCompleted7,
        claimEvents7,
        claimEvents30,
        leadsBySourceKindToday,
        leadsBySourceKindTotal,
        leadsRejectedToday,
        leadsRejectedTotal,
        outreachSent7,
        outreachDelivered7,
        outreachClicked7,
        uniqueCityCount: cityMap.size,
        uniqueRegionCount: uniqueRegions.length,
        topCityHubs: cityHubs,
        prairieMoonAndSuburbs: prairieMoon,
        suburbSample,
        irvingAndIndianapolis: irving,
        geoWouldFixCount: geoWouldFix.length,
        geoWouldFixSample: geoWouldFix.slice(0, 25),
        weekAgo: weekAgo.toISOString(),
        monthAgo: monthAgo.toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
  await pool.end();
}
