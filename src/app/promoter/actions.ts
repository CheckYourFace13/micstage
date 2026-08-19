"use server";

import { cookies } from "next/headers";
import { Prisma, PromoterVenueAccessStatus } from "@/generated/prisma/client";
import { requirePromoterSession } from "@/lib/authz";
import { assertVenueExistsForHostNight } from "@/lib/host/hostAuthorization";
import { provisionHostNightLineup } from "@/lib/host/hostNightProvisioning";
import { maybeRecordHostSecondVenueActivation } from "@/lib/host/hostSecondVenueActivation";
import { resolveVenueForHostLocation } from "@/lib/host/resolveHostVenue";
import { requirePrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "series"
  );
}

function parseYmdUtc(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function parseWeekday(raw: string): number | null {
  const idx = WEEKDAYS.indexOf(raw.toUpperCase() as (typeof WEEKDAYS)[number]);
  return idx >= 0 ? idx : null;
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export async function setupFirstHostNightAction(formData: FormData) {
  const session = await requirePromoterSession();
  const name = formData.get("name")?.toString().trim();
  const dateRaw = formData.get("date")?.toString().trim();
  if (!name || !dateRaw) redirect("/promoter/welcome?error=missing");

  const date = parseYmdUtc(dateRaw);
  if (!date) redirect("/promoter/welcome?error=date");

  const signupEnabled = formData.get("signupEnabled") === "on";
  const prisma = requirePrisma();

  let venueId = formData.get("venueId")?.toString().trim() || null;
  if (!venueId) {
    const placeId = formData.get("googlePlaceId")?.toString().trim();
    const venueName = formData.get("venueName")?.toString().trim();
    const formattedAddress = formData.get("formattedAddress")?.toString().trim();
    const lat = Number.parseFloat(formData.get("lat")?.toString() ?? "");
    const lng = Number.parseFloat(formData.get("lng")?.toString() ?? "");
    if (placeId && venueName && formattedAddress && Number.isFinite(lat) && Number.isFinite(lng)) {
      const resolved = await resolveVenueForHostLocation(prisma, {
        googlePlaceId: placeId,
        venueName,
        formattedAddress,
        lat,
        lng,
        city: formData.get("city")?.toString(),
        region: formData.get("region")?.toString(),
        country: formData.get("country")?.toString(),
      });
      venueId = resolved.venueId;
    }
  }
  if (!venueId || !(await assertVenueExistsForHostNight(prisma, venueId))) {
    redirect("/promoter/welcome?error=venue");
  }

  let slugInput = slugifyName(name);
  if (!SLUG_RE.test(slugInput)) redirect("/promoter/welcome?error=series");

  try {
    const series = await prisma.promoterSeries.create({
      data: { promoterId: session.promoterId, name, slug: slugInput },
    });
    const night = await prisma.promoterNight.create({
      data: { seriesId: series.id, venueId, date, signupEnabled },
    });
    await provisionHostNightLineup(prisma, night.id, { signupEnabled });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/promoter/welcome?error=duplicate");
    }
    redirect("/promoter/welcome?error=save");
  }

  const store = await cookies();
  store.set("om_promoter_welcome_seen", "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });

  revalidatePath("/promoter");
  revalidatePath("/hosts");
  redirect("/promoter?promoter=series_ok");
}

export async function createPromoterSeriesAction(formData: FormData) {
  const session = await requirePromoterSession();
  const nameRaw = formData.get("name");
  const descriptionRaw = formData.get("description");
  const venueNameRaw = formData.get("venueName");
  if (typeof nameRaw !== "string" || !nameRaw.trim()) redirect("/promoter?promoter=series_invalid");

  const name = nameRaw.trim();
  let slugInput = slugifyName(name);
  if (!SLUG_RE.test(slugInput) || slugInput.length > 64) redirect("/promoter?promoter=series_slug");

  const venueName =
    typeof venueNameRaw === "string" && venueNameRaw.trim() ? venueNameRaw.trim().slice(0, 120) : "";
  const descriptionParts: string[] = [];
  if (typeof descriptionRaw === "string" && descriptionRaw.trim()) descriptionParts.push(descriptionRaw.trim());
  if (venueName) descriptionParts.push(`Venue: ${venueName}`);
  const description = descriptionParts.length ? descriptionParts.join("\n") : undefined;

  const prisma = requirePrisma();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? slugInput : `${slugInput}-${attempt + 1}`;
    try {
      await prisma.promoterSeries.create({
        data: {
          promoterId: session.promoterId,
          name,
          slug: candidate,
          description,
        },
      });
      revalidatePath("/promoter");
      revalidatePath("/promoter/welcome");
      if (venueName) {
        redirect(`/promoter?promoter=series_ok&focus=find&q=${encodeURIComponent(venueName)}`);
      }
      redirect("/promoter?promoter=series_ok&focus=schedule");
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue;
      }
      console.error("[createPromoterSeriesAction]", e);
      redirect("/promoter?promoter=series_error");
    }
  }
  redirect("/promoter?promoter=series_taken");
}

async function requestAccessToVenueId(promoterId: string, venueId: string) {
  const prisma = requirePrisma();
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true },
  });
  if (!venue) redirect("/promoter?promoter=venue_missing");

  const existing = await prisma.promoterVenueAccess.findUnique({
    where: {
      promoterId_venueId: { promoterId, venueId: venue.id },
    },
    select: { id: true, status: true },
  });
  if (existing?.status === PromoterVenueAccessStatus.APPROVED) {
    redirect("/promoter?promoter=venue_already");
  }
  if (existing?.status === PromoterVenueAccessStatus.PENDING) {
    redirect("/promoter?promoter=venue_pending");
  }

  try {
    if (existing?.status === PromoterVenueAccessStatus.REVOKED) {
      await prisma.promoterVenueAccess.update({
        where: { id: existing.id },
        data: { status: PromoterVenueAccessStatus.PENDING, respondedAt: null },
      });
    } else {
      await prisma.promoterVenueAccess.create({
        data: {
          promoterId,
          venueId: venue.id,
          status: PromoterVenueAccessStatus.PENDING,
        },
      });
    }
  } catch (e) {
    console.error("[requestAccessToVenueId]", e);
    redirect("/promoter?promoter=venue_error");
  }

  revalidatePath("/promoter");
  revalidatePath("/promoter/welcome");
  revalidatePath("/venue");
  redirect("/promoter?promoter=connected");
}

/** Optional: request delegated venue-management access (separate from scheduling a night). */
export async function requestPromoterVenueAccessByVenueIdAction(formData: FormData) {
  const session = await requirePromoterSession();
  const venueIdRaw = formData.get("venueId");
  if (typeof venueIdRaw !== "string" || !venueIdRaw.trim()) {
    redirect("/promoter?promoter=venue_invalid");
  }
  await requestAccessToVenueId(session.promoterId, venueIdRaw.trim());
}

/** @deprecated Prefer requestPromoterVenueAccessByVenueIdAction */
export async function requestPromoterVenueAccessAction(formData: FormData) {
  const session = await requirePromoterSession();
  const venueIdRaw = formData.get("venueId");
  if (typeof venueIdRaw === "string" && venueIdRaw.trim()) {
    await requestAccessToVenueId(session.promoterId, venueIdRaw.trim());
  }

  const slugRaw = formData.get("venueSlug");
  if (typeof slugRaw !== "string" || !slugRaw.trim()) redirect("/promoter?promoter=venue_invalid");

  const venueSlug = slugRaw.trim().toLowerCase();
  const prisma = requirePrisma();
  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true },
  });
  if (!venue) redirect("/promoter?promoter=venue_missing");
  await requestAccessToVenueId(session.promoterId, venue.id);
}

function parseSignupEnabled(formData: FormData): boolean {
  return formData.get("signupEnabled") === "on" || formData.get("signupEnabled") === "true";
}

async function resolveVenueIdFromForm(formData: FormData, prisma: ReturnType<typeof requirePrisma>): Promise<string | null> {
  const venueId = formData.get("venueId")?.toString().trim();
  if (venueId) return venueId;

  const placeId = formData.get("googlePlaceId")?.toString().trim();
  const venueName = formData.get("venueName")?.toString().trim();
  const formattedAddress = formData.get("formattedAddress")?.toString().trim();
  const lat = Number.parseFloat(formData.get("lat")?.toString() ?? "");
  const lng = Number.parseFloat(formData.get("lng")?.toString() ?? "");
  if (!placeId || !venueName || !formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const { venueId: resolved } = await resolveVenueForHostLocation(prisma, {
    googlePlaceId: placeId,
    venueName,
    formattedAddress,
    lat,
    lng,
    city: formData.get("city")?.toString(),
    region: formData.get("region")?.toString(),
    country: formData.get("country")?.toString(),
  });
  return resolved;
}

/** Schedule a night at a venue location — no venue-ownership or PromoterVenueAccess approval required. */
export async function addPromoterNightAction(formData: FormData) {
  const session = await requirePromoterSession();
  const seriesId = formData.get("seriesId");
  const dateRaw = formData.get("date");
  const titleRaw = formData.get("title");
  if (typeof seriesId !== "string" || !seriesId.trim()) redirect("/promoter?promoter=night_invalid");
  if (typeof dateRaw !== "string" || !dateRaw.trim()) redirect("/promoter?promoter=night_invalid");

  const date = parseYmdUtc(dateRaw.trim());
  if (!date) redirect("/promoter?promoter=night_bad_date");

  const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : undefined;
  const signupEnabled = parseSignupEnabled(formData);

  const prisma = requirePrisma();
  const resolvedVenueId = await resolveVenueIdFromForm(formData, prisma);
  if (!resolvedVenueId) redirect("/promoter?promoter=night_invalid");

  const series = await prisma.promoterSeries.findFirst({
    where: { id: seriesId.trim(), promoterId: session.promoterId },
    select: { id: true },
  });
  if (!series) redirect("/promoter?promoter=forbidden");

  if (!(await assertVenueExistsForHostNight(prisma, resolvedVenueId))) {
    redirect("/promoter?promoter=venue_missing");
  }

  let nightId: string;
  try {
    const night = await prisma.promoterNight.create({
      data: {
        seriesId: series.id,
        venueId: resolvedVenueId,
        date,
        title,
        signupEnabled,
      },
    });
    nightId = night.id;
    await provisionHostNightLineup(prisma, nightId, { signupEnabled });
    await maybeRecordHostSecondVenueActivation(prisma, session.promoterId, resolvedVenueId, nightId);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/promoter?promoter=night_duplicate");
    }
    console.error("[addPromoterNightAction]", e);
    redirect("/promoter?promoter=night_error");
  }

  revalidatePath("/promoter");
  revalidatePath("/hosts");
  revalidatePath(`/nights/${nightId}/lineup`);
  redirect("/promoter?promoter=night_ok");
}

/** Add recurring weekly/biweekly/monthly nights at a venue (bounded). */
export async function addPromoterRecurringNightsAction(formData: FormData) {
  const session = await requirePromoterSession();
  const seriesId = formData.get("seriesId")?.toString().trim();
  const startRaw = formData.get("startDate")?.toString().trim();
  const weekdayRaw = formData.get("weekday")?.toString().trim();
  const frequency = formData.get("frequency")?.toString().trim() || "weekly";
  const countRaw = formData.get("occurrences")?.toString().trim() || "8";
  const signupEnabled = parseSignupEnabled(formData);
  if (!seriesId || !startRaw || !weekdayRaw) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const resolvedVenueId = await resolveVenueIdFromForm(formData, prisma);
  if (!resolvedVenueId) redirect("/promoter?promoter=night_invalid");

  const start = parseYmdUtc(startRaw);
  const weekday = parseWeekday(weekdayRaw);
  const occurrences = Math.min(26, Math.max(1, Number.parseInt(countRaw, 10) || 8));
  if (!start || weekday == null) redirect("/promoter?promoter=night_bad_date");

  const series = await prisma.promoterSeries.findFirst({
    where: { id: seriesId, promoterId: session.promoterId },
    select: { id: true },
  });
  if (!series) redirect("/promoter?promoter=forbidden");
  if (!(await assertVenueExistsForHostNight(prisma, resolvedVenueId))) redirect("/promoter?promoter=venue_missing");

  const stepDays = frequency === "monthly" ? 28 : frequency === "biweekly" ? 14 : 7;
  let cursor = start;
  while (cursor.getUTCDay() !== weekday) {
    cursor = addDaysUtc(cursor, 1);
  }

  let created = 0;
  for (let i = 0; i < occurrences; i++) {
    try {
      const night = await prisma.promoterNight.create({
        data: { seriesId: series.id, venueId: resolvedVenueId, date: cursor, signupEnabled },
      });
      await provisionHostNightLineup(prisma, night.id, { signupEnabled });
      await maybeRecordHostSecondVenueActivation(
        prisma,
        session.promoterId,
        resolvedVenueId,
        night.id,
      );
      created += 1;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
        console.error("[addPromoterRecurringNightsAction]", e);
      }
    }
    cursor = addDaysUtc(cursor, stepDays);
  }

  revalidatePath("/promoter");
  redirect(created > 0 ? "/promoter?promoter=night_ok" : "/promoter?promoter=night_duplicate");
}

/** Change venue for one night or this and future nights in the same series. */
export async function changePromoterNightVenueAction(formData: FormData) {
  const session = await requirePromoterSession();
  const nightId = formData.get("nightId")?.toString().trim();
  const newVenueId = formData.get("newVenueId")?.toString().trim();
  const scope = formData.get("scope")?.toString().trim() || "this";
  if (!nightId || !newVenueId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const night = await prisma.promoterNight.findFirst({
    where: { id: nightId, series: { promoterId: session.promoterId } },
    select: { id: true, seriesId: true, venueId: true, date: true },
  });
  if (!night) redirect("/promoter?promoter=forbidden");
  if (!(await assertVenueExistsForHostNight(prisma, newVenueId))) redirect("/promoter?promoter=venue_missing");

  if (scope === "future") {
    await prisma.promoterNight.updateMany({
      where: {
        seriesId: night.seriesId,
        venueId: night.venueId,
        date: { gte: night.date },
      },
      data: { venueId: newVenueId },
    });
  } else {
    try {
      await prisma.promoterNight.update({
        where: { id: night.id },
        data: { venueId: newVenueId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        redirect("/promoter?promoter=night_duplicate");
      }
      redirect("/promoter?promoter=night_error");
    }
  }

  revalidatePath("/promoter");
  redirect("/promoter?promoter=venue_changed");
}
