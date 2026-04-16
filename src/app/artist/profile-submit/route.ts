import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "../../../generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";
import { MUSICIAN_INSTRUMENTS, MUSICIAN_SPECIALIZATIONS } from "@/lib/musicianProfile";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

class RedirectSignal extends Error {
  readonly path: string;

  constructor(path: string) {
    super(path);
    this.path = path;
  }
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=invalidForm`);
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

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?profileError=invalidForm`);
  }

  const session = await getSession();
  if (!session || session.kind !== "musician") {
    return redirectTo("/login/musician?next=%2Fartist");
  }
  const musicianId = session.musicianId;

  try {
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
      throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=radius`);
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
    if (
      hasSecondaryHint &&
      (secondaryRadiusMiles == null || secondaryRadiusMiles < 1 || secondaryRadiusMiles > 500)
    ) {
      throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=secondaryRadius`);
    }

    const yearsPlaying = optInt(formData, "yearsPlaying");
    if (yearsPlaying != null && (yearsPlaying < 0 || yearsPlaying > 80)) {
      throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=years`);
    }

    const setLengthMinutes = optInt(formData, "setLengthMinutes");
    if (setLengthMinutes != null && (setLengthMinutes < 5 || setLengthMinutes > 240)) {
      throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=setLength`);
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
    const prisma = requirePrisma();
    if (allPicked.length) {
      const count = await prisma.venue.count({ where: { id: { in: allPicked } } });
      if (count !== allPicked.length) {
        throw new RedirectSignal(`${ARTIST_DASHBOARD_HREF}?profileError=venues`);
      }
    }

    await prisma.$transaction(async (tx) => {
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
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?profile=saved`);
  } catch (e) {
    if (e instanceof RedirectSignal) return redirectTo(e.path);
    throw e;
  }
}
