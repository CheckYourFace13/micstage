"use server";

import { requirePrisma } from "@/lib/prisma";

export async function lookupMicStageVenueByGooglePlaceId(googlePlaceId: string) {
  if (!googlePlaceId?.trim()) return null;
  return requirePrisma().venue.findUnique({
    where: { googlePlaceId: googlePlaceId.trim() },
    select: { id: true, name: true, city: true, region: true },
  });
}
