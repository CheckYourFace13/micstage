"use server";

import { Prisma, PromoterVenueAccessStatus } from "@/generated/prisma/client";
import { requirePromoterSession } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export async function createPromoterSeriesAction(formData: FormData) {
  const session = await requirePromoterSession();
  const nameRaw = formData.get("name");
  const slugRaw = formData.get("slug");
  const descriptionRaw = formData.get("description");
  if (typeof nameRaw !== "string" || !nameRaw.trim()) redirect("/promoter?promoter=series_invalid");

  const name = nameRaw.trim();
  const slugInput = typeof slugRaw === "string" && slugRaw.trim() ? slugRaw.trim().toLowerCase() : slugifyName(name);
  if (!SLUG_RE.test(slugInput) || slugInput.length > 64) redirect("/promoter?promoter=series_slug");

  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim() ? descriptionRaw.trim() : undefined;

  const prisma = requirePrisma();
  try {
    await prisma.promoterSeries.create({
      data: {
        promoterId: session.promoterId,
        name,
        slug: slugInput,
        description,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/promoter?promoter=series_taken");
    }
    console.error("[createPromoterSeriesAction]", e);
    redirect("/promoter?promoter=series_error");
  }

  revalidatePath("/promoter");
  redirect("/promoter?promoter=series_ok");
}

export async function requestPromoterVenueAccessAction(formData: FormData) {
  const session = await requirePromoterSession();
  const slugRaw = formData.get("venueSlug");
  if (typeof slugRaw !== "string" || !slugRaw.trim()) redirect("/promoter?promoter=venue_invalid");

  const venueSlug = slugRaw.trim().toLowerCase();
  const prisma = requirePrisma();
  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true },
  });
  if (!venue) redirect("/promoter?promoter=venue_missing");

  const existing = await prisma.promoterVenueAccess.findUnique({
    where: {
      promoterId_venueId: { promoterId: session.promoterId, venueId: venue.id },
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
          promoterId: session.promoterId,
          venueId: venue.id,
          status: PromoterVenueAccessStatus.PENDING,
        },
      });
    }
  } catch (e) {
    console.error("[requestPromoterVenueAccessAction]", e);
    redirect("/promoter?promoter=venue_error");
  }

  revalidatePath("/promoter");
  revalidatePath("/venue");
  redirect("/promoter?promoter=venue_request");
}

export async function addPromoterNightAction(formData: FormData) {
  const session = await requirePromoterSession();
  const seriesId = formData.get("seriesId");
  const venueId = formData.get("venueId");
  const dateRaw = formData.get("date");
  const titleRaw = formData.get("title");
  if (typeof seriesId !== "string" || !seriesId.trim()) redirect("/promoter?promoter=night_invalid");
  if (typeof venueId !== "string" || !venueId.trim()) redirect("/promoter?promoter=night_invalid");
  if (typeof dateRaw !== "string" || !dateRaw.trim()) redirect("/promoter?promoter=night_invalid");

  const date = parseYmdUtc(dateRaw.trim());
  if (!date) redirect("/promoter?promoter=night_bad_date");

  const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : undefined;

  const prisma = requirePrisma();
  const series = await prisma.promoterSeries.findFirst({
    where: { id: seriesId.trim(), promoterId: session.promoterId },
    select: { id: true },
  });
  if (!series) redirect("/promoter?promoter=forbidden");

  const access = await prisma.promoterVenueAccess.findUnique({
    where: {
      promoterId_venueId: { promoterId: session.promoterId, venueId: venueId.trim() },
    },
    select: { status: true },
  });
  if (!access || access.status !== PromoterVenueAccessStatus.APPROVED) {
    redirect("/promoter?promoter=night_no_access");
  }

  try {
    await prisma.promoterNight.create({
      data: {
        seriesId: series.id,
        venueId: venueId.trim(),
        date,
        title,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/promoter?promoter=night_duplicate");
    }
    console.error("[addPromoterNightAction]", e);
    redirect("/promoter?promoter=night_error");
  }

  revalidatePath("/promoter");
  redirect("/promoter?promoter=night_ok");
}
