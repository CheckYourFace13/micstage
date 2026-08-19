/**
 * Resolve or create a MicStage Venue for host night scheduling without granting ownership.
 */
import crypto from "node:crypto";
import tzLookup from "tz-lookup";
import type { PrismaClient } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";

const SYSTEM_OWNER_EMAIL = "host-locations@locations.micstage.internal";
const UNUSABLE_PASSWORD = "host-location-no-login:";

export type HostVenuePlaceInput = {
  venueName: string;
  googlePlaceId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

async function uniqueVenueSlug(prisma: PrismaClient, base: string): Promise<string> {
  const slug = slugify(base) || `venue-${Date.now().toString(36)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const exists = await prisma.venue.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

async function ensureSystemLocationOwner(prisma: PrismaClient) {
  const existing = await prisma.venueOwner.findUnique({
    where: { email: SYSTEM_OWNER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const owner = await prisma.venueOwner.create({
    data: {
      email: SYSTEM_OWNER_EMAIL,
      passwordHash: UNUSABLE_PASSWORD + crypto.randomBytes(16).toString("hex"),
    },
  });
  return owner.id;
}

export async function resolveVenueForHostLocation(
  prisma: PrismaClient,
  input: HostVenuePlaceInput,
): Promise<{ venueId: string; created: boolean }> {
  const placeId = input.googlePlaceId.trim();
  if (!placeId) throw new Error("place_required");

  const existing = await prisma.venue.findUnique({
    where: { googlePlaceId: placeId },
    select: { id: true },
  });
  if (existing) return { venueId: existing.id, created: false };

  let timeZone = "America/Chicago";
  try {
    timeZone = tzLookup(input.lat, input.lng);
  } catch {
    /* fallback */
  }

  const ownerId = await ensureSystemLocationOwner(prisma);
  const slug = await uniqueVenueSlug(prisma, input.venueName.trim() || "venue");

  const venue = await prisma.venue.create({
    data: {
      ownerId,
      name: input.venueName.trim().slice(0, 200),
      slug,
      googlePlaceId: placeId,
      formattedAddress: input.formattedAddress.trim().slice(0, 500),
      city: input.city?.trim().slice(0, 120) || null,
      region: input.region?.trim().slice(0, 120) || null,
      country: input.country?.trim().slice(0, 80) || null,
      lat: input.lat,
      lng: input.lng,
      timeZone,
    },
    select: { id: true },
  });

  return { venueId: venue.id, created: true };
}
