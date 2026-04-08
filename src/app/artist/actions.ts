"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "../../generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import { requireMusicianSession } from "@/lib/authz";
import { MUSICIAN_INSTRUMENTS, MUSICIAN_SPECIALIZATIONS } from "@/lib/musicianProfile";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { storeProfileImage } from "@/lib/profileAssetStorage";

export async function lookupMicStageVenueByGooglePlaceId(googlePlaceId: string) {
  if (!googlePlaceId?.trim()) return null;
  return requirePrisma().venue.findUnique({
    where: { googlePlaceId: googlePlaceId.trim() },
    select: { id: true, name: true, city: true, region: true },
  });
}

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) redirect(`${ARTIST_DASHBOARD_HREF}?profileError=invalidForm`);
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
  const imageSecondaryUrl = normalizeUrl(optString(formData, "imageSecondaryUrl"));
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
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=radius`);
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
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=secondaryRadius`);
  }

  const yearsPlaying = optInt(formData, "yearsPlaying");
  if (yearsPlaying != null && (yearsPlaying < 0 || yearsPlaying > 80)) {
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=years`);
  }

  const setLengthMinutes = optInt(formData, "setLengthMinutes");
  if (setLengthMinutes != null && (setLengthMinutes < 5 || setLengthMinutes > 240)) {
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=setLength`);
  }

  const openToHire = formData.get("openToHire") === "on";
  const weeklyNearbyOpenMicAlerts = formData.get("weeklyNearbyOpenMicAlerts") === "on";
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
      redirect(`${ARTIST_DASHBOARD_HREF}?profileError=venues`);
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
        imageSecondaryUrl,
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
        weeklyNearbyOpenMicAlerts,
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

  revalidatePath(ARTIST_DASHBOARD_HREF);
  redirect(`${ARTIST_DASHBOARD_HREF}?profile=saved`);
}

async function readNamedImageFile(
  formData: FormData,
  fieldName: string,
): Promise<{ buf: Buffer; type: string } | { error: string }> {
  const file = formData.get(fieldName);
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "missing_file" };
  }
  const blob = file as File;
  const type = (blob.type || "").split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const buf = Buffer.from(await blob.arrayBuffer());
  return { buf, type };
}

async function uploadMusicianImageSlot(formData: FormData, slot: "profile" | "secondary") {
  const session = await requireMusicianSession();
  const musicianId = session.musicianId;
  const field = slot === "profile" ? "artistUploadProfile" : "artistUploadSecondary";
  const read = await readNamedImageFile(formData, field);
  if ("error" in read) {
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=uploadMissing`);
  }

  const stored = await storeProfileImage(
    read.buf,
    read.type,
    `artist/${musicianId}/${slot}-${Date.now()}`,
  );
  if (!stored.ok) {
    redirect(`${ARTIST_DASHBOARD_HREF}?profileError=upload_${stored.error}`);
  }

  const data =
    slot === "profile" ? { imageUrl: stored.publicUrl } : { imageSecondaryUrl: stored.publicUrl };

  await requirePrisma().musicianUser.update({
    where: { id: musicianId },
    data,
  });
  revalidatePath(ARTIST_DASHBOARD_HREF);
  redirect(`${ARTIST_DASHBOARD_HREF}?profile=imageUploaded`);
}

export async function uploadMusicianProfilePhoto(formData: FormData) {
  return uploadMusicianImageSlot(formData, "profile");
}

export async function uploadMusicianSecondaryPhoto(formData: FormData) {
  return uploadMusicianImageSlot(formData, "secondary");
}
