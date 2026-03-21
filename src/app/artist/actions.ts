"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "../../generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import { requireMusicianSession } from "@/lib/authz";
import { MUSICIAN_INSTRUMENTS, MUSICIAN_SPECIALIZATIONS } from "@/lib/musicianProfile";

export async function lookupMicStageVenueByGooglePlaceId(googlePlaceId: string) {
  if (!googlePlaceId?.trim()) return null;
  return requirePrisma().venue.findUnique({
    where: { googlePlaceId: googlePlaceId.trim() },
    select: { id: true, name: true, city: true, region: true },
  });
}

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

function optString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function optInt(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function optFloat(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeUrl(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function allowedTagSet(allowed: { value: string }[], picked: string[]): string[] {
  const ok = new Set(allowed.map((a) => a.value));
  return [...new Set(picked.filter((p) => ok.has(p)))];
}

function uniqueVenueIds(raw: FormDataEntryValue[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function updateMusicianProfile(formData: FormData) {
  const session = await requireMusicianSession();
  const musicianId = session.musicianId;

  const stageName = reqString(formData, "stageName");
  const firstName = optString(formData, "firstName");
  const lastName = optString(formData, "lastName");
  const bio = optString(formData, "bio");
  const websiteUrl = normalizeUrl(optString(formData, "websiteUrl"));
  const imageUrl = normalizeUrl(optString(formData, "imageUrl"));
  const facebookUrl = normalizeUrl(optString(formData, "facebookUrl"));
  const instagramUrl = normalizeUrl(optString(formData, "instagramUrl"));
  const twitterUrl = normalizeUrl(optString(formData, "twitterUrl"));
  const tiktokUrl = normalizeUrl(optString(formData, "tiktokUrl"));
  const youtubeUrl = normalizeUrl(optString(formData, "youtubeUrl"));
  const soundcloudUrl = normalizeUrl(optString(formData, "soundcloudUrl"));

  const homeGooglePlaceId = optString(formData, "homeGooglePlaceId");
  const homeFormattedAddress = optString(formData, "homeFormattedAddress");
  const homeLat = optFloat(formData, "homeLat");
  const homeLng = optFloat(formData, "homeLng");
  const homeCity = optString(formData, "homeCity");
  const homeRegion = optString(formData, "homeRegion");
  const travelRadiusMiles = optInt(formData, "travelRadiusMiles");
  if (travelRadiusMiles != null && (travelRadiusMiles < 1 || travelRadiusMiles > 500)) {
    redirect("/artist?profileError=radius");
  }

  const secondaryGooglePlaceId = optString(formData, "secondaryGooglePlaceId");
  const secondaryFormattedAddress = optString(formData, "secondaryFormattedAddress");
  const secondaryLat = optFloat(formData, "secondaryLat");
  const secondaryLng = optFloat(formData, "secondaryLng");
  const secondaryCity = optString(formData, "secondaryCity");
  const secondaryRegion = optString(formData, "secondaryRegion");
  const secondaryRadiusMiles = optInt(formData, "secondaryRadiusMiles");

  const hasSecondaryHint = Boolean(
    secondaryGooglePlaceId ||
      secondaryFormattedAddress ||
      secondaryCity ||
      secondaryRegion ||
      secondaryLat != null ||
      secondaryLng != null,
  );
  if (hasSecondaryHint && (secondaryRadiusMiles == null || secondaryRadiusMiles < 1 || secondaryRadiusMiles > 500)) {
    redirect("/artist?profileError=secondaryRadius");
  }

  const yearsPlaying = optInt(formData, "yearsPlaying");
  if (yearsPlaying != null && (yearsPlaying < 0 || yearsPlaying > 80)) {
    redirect("/artist?profileError=years");
  }

  const setLengthMinutes = optInt(formData, "setLengthMinutes");
  if (setLengthMinutes != null && (setLengthMinutes < 5 || setLengthMinutes > 240)) {
    redirect("/artist?profileError=setLength");
  }

  const openToHire = formData.get("openToHire") === "on";
  const hireRateDescription = optString(formData, "hireRateDescription");
  const collaborationsText = optString(formData, "collaborationsText");

  const specPicked = formData.getAll("specialization").filter((x): x is string => typeof x === "string");
  const instPicked = formData.getAll("instrument").filter((x): x is string => typeof x === "string");
  const specializations = allowedTagSet(MUSICIAN_SPECIALIZATIONS, specPicked);
  const instruments = allowedTagSet(MUSICIAN_INSTRUMENTS, instPicked);

  const pastIds = uniqueVenueIds(formData.getAll("pastVenueId"));
  const interestIds = uniqueVenueIds(formData.getAll("interestedVenueId"));

  const allPicked = [...new Set([...pastIds, ...interestIds])];
  if (allPicked.length) {
    const count = await requirePrisma().venue.count({ where: { id: { in: allPicked } } });
    if (count !== allPicked.length) {
      redirect("/artist?profileError=venues");
    }
  }
  await requirePrisma().$transaction(async (tx) => {
    await tx.musicianPastVenue.deleteMany({ where: { musicianId } });
    await tx.musicianVenueInterest.deleteMany({ where: { musicianId } });

    await tx.musicianUser.update({
      where: { id: musicianId },
      data: {
        stageName,
        firstName,
        lastName,
        bio,
        websiteUrl,
        imageUrl,
        facebookUrl,
        instagramUrl,
        twitterUrl,
        tiktokUrl,
        youtubeUrl,
        soundcloudUrl,
        specializations: specializations.length ? specializations : Prisma.JsonNull,
        instruments: instruments.length ? instruments : Prisma.JsonNull,
        yearsPlaying,
        openToHire,
        hireRateDescription,
        setLengthMinutes,
        collaborationsText,
        homeGooglePlaceId,
        homeFormattedAddress,
        homeLat,
        homeLng,
        homeCity,
        homeRegion,
        travelRadiusMiles,
        ...(hasSecondaryHint
          ? {
              secondaryGooglePlaceId,
              secondaryFormattedAddress,
              secondaryLat,
              secondaryLng,
              secondaryCity,
              secondaryRegion,
              secondaryRadiusMiles,
            }
          : {
              secondaryGooglePlaceId: null,
              secondaryFormattedAddress: null,
              secondaryLat: null,
              secondaryLng: null,
              secondaryCity: null,
              secondaryRegion: null,
              secondaryRadiusMiles: null,
            }),
      },
    });

    if (pastIds.length) {
      await tx.musicianPastVenue.createMany({
        data: pastIds.map((venueId) => ({ musicianId, venueId })),
      });
    }
    if (interestIds.length) {
      await tx.musicianVenueInterest.createMany({
        data: interestIds.map((venueId) => ({ musicianId, venueId })),
      });
    }
  });

  revalidatePath("/artist");
  redirect("/artist?profile=saved");
}
