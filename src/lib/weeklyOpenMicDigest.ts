import type { PrismaClient } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/publicSeo";
import { storageYmdUtc } from "@/lib/venuePublicLineup";

const EARTH_RADIUS_MI = 3959;
const DIGEST_HORIZON_DAYS = 14;
const DEFAULT_RADIUS_MI = 75;
const MAX_RADIUS_MI = 150;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

function venueWithinRadius(
  mLat: number,
  mLng: number,
  radiusMi: number,
  vLat: number | null,
  vLng: number | null,
): boolean {
  if (vLat == null || vLng == null) return false;
  return haversineMiles(mLat, mLng, vLat, vLng) <= radiusMi;
}

function cityLooseMatch(
  mCity: string | null,
  mRegion: string | null,
  vCity: string | null,
  vRegion: string | null,
): boolean {
  if (!mCity?.trim() || !vCity?.trim()) return false;
  if (mCity.trim().toLowerCase() !== vCity.trim().toLowerCase()) return false;
  if (!mRegion?.trim() || !vRegion?.trim()) return true;
  return mRegion.trim().toLowerCase() === vRegion.trim().toLowerCase();
}

export type WeeklyDigestStats = {
  musiciansConsidered: number;
  emailsSent: number;
  skippedNoLocation: number;
  errors: number;
};

/**
 * Nearby = within min(travelRadiusMiles, MAX_RADIUS_MI) of home coordinates when both exist;
 * else same city (+ region when both set); secondary home area not used in MVP digest.
 */
export async function runWeeklyOpenMicDigestJob(prisma: PrismaClient, now: Date): Promise<WeeklyDigestStats> {
  const stats: WeeklyDigestStats = {
    musiciansConsidered: 0,
    emailsSent: 0,
    skippedNoLocation: 0,
    errors: 0,
  };

  const minLastSent = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const musicians = await prisma.musicianUser.findMany({
    where: {
      weeklyNearbyOpenMicAlerts: true,
      OR: [{ weeklyNearbyDigestLastSentAt: null }, { weeklyNearbyDigestLastSentAt: { lt: minLastSent } }],
    },
    select: {
      id: true,
      email: true,
      stageName: true,
      homeLat: true,
      homeLng: true,
      homeCity: true,
      homeRegion: true,
      travelRadiusMiles: true,
    },
  });

  const horizonEnd = new Date(now.getTime() + DIGEST_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const venues = await prisma.venue.findMany({
    where: {
      eventTemplates: { some: { isPublic: true } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      region: true,
      lat: true,
      lng: true,
      eventTemplates: {
        where: { isPublic: true },
        select: {
          instances: {
            where: { date: { gte: now, lte: horizonEnd }, isCancelled: false },
            select: { date: true },
            orderBy: { date: "asc" },
            take: 20,
          },
        },
      },
    },
  });

  for (const m of musicians) {
    stats.musiciansConsidered += 1;
    const hasCoords = m.homeLat != null && m.homeLng != null;
    const hasCity = Boolean(m.homeCity?.trim());
    if (!hasCoords && !hasCity) {
      stats.skippedNoLocation += 1;
      continue;
    }

    const radius = Math.min(
      MAX_RADIUS_MI,
      Math.max(10, m.travelRadiusMiles ?? DEFAULT_RADIUS_MI),
    );

    const nearbyVenues: { id: string; name: string; slug: string; nights: string[] }[] = [];

    for (const v of venues) {
      let near = false;
      if (hasCoords && v.lat != null && v.lng != null) {
        near = venueWithinRadius(m.homeLat!, m.homeLng!, radius, v.lat, v.lng);
      } else if (hasCity) {
        near = cityLooseMatch(m.homeCity, m.homeRegion, v.city, v.region);
      }
      if (!near) continue;

      const nights: string[] = [];
      for (const t of v.eventTemplates) {
        for (const inst of t.instances) {
          nights.push(storageYmdUtc(inst.date));
        }
      }
      const uniq = [...new Set(nights)].sort();
      if (uniq.length === 0) continue;
      nearbyVenues.push({ id: v.id, name: v.name, slug: v.slug, nights: uniq.slice(0, 5) });
    }

    if (nearbyVenues.length === 0) continue;

    const findUrl = absoluteUrl("/find-open-mics");
    const profileUrl = absoluteUrl("/artist");
    const subject = "Your weekly nearby open mics on MicStage";
    const lines = nearbyVenues
      .slice(0, 12)
      .map(
        (v) =>
          `- ${v.name} — ${v.nights.map((d) => d).join(", ")} — ${absoluteUrl(`/venues/${v.slug}`)}`,
      )
      .join("\n");
    const text = `Hi ${m.stageName},

Here are open mic nights coming up near the area on your MicStage profile (next ~${DIGEST_HORIZON_DAYS} days):

${lines}

Browse more: ${findUrl}

You opted in to this weekly email in your artist profile. Turn it off anytime: ${profileUrl}

— MicStage`;

    const html = `<p>Hi ${escapeHtml(m.stageName)},</p>
<p>Here are open mic nights coming up near the area on your MicStage profile (next ~${DIGEST_HORIZON_DAYS} days):</p>
<ul>${nearbyVenues
      .slice(0, 12)
      .map(
        (v) =>
          `<li><strong>${escapeHtml(v.name)}</strong> — ${escapeHtml(v.nights.join(", "))} — <a href="${escapeHtml(absoluteUrl(`/venues/${v.slug}`))}">View on MicStage</a></li>`,
      )
      .join("")}</ul>
<p><a href="${escapeHtml(findUrl)}">Find more open mics</a></p>
<p style="font-size:12px;color:#666;">You opted in to this weekly email in your <a href="${escapeHtml(profileUrl)}">artist profile</a>. Turn it off there anytime.</p>
<p style="font-size:12px;color:#666;">— MicStage</p>`;

    try {
      await sendEmail({ to: m.email, subject, text, html });
      await prisma.musicianUser.update({
        where: { id: m.id },
        data: { weeklyNearbyDigestLastSentAt: now },
      });
      stats.emailsSent += 1;
    } catch (e) {
      stats.errors += 1;
      console.error("[weekly digest] send failed", m.id, e);
    }
  }

  return stats;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
