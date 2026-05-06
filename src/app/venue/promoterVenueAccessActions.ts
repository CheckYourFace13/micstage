"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { PromoterVenueAccessStatus } from "@/generated/prisma/client";

export async function approvePromoterVenueAccessAction(formData: FormData) {
  const session = await requireVenueSession();
  const idRaw = formData.get("accessId");
  if (typeof idRaw !== "string" || !idRaw.trim()) redirect("/venue?promoterAccess=invalid");

  const id = idRaw.trim();
  const prisma = requirePrisma();
  const venueIds = await venueIdsForSession(session);

  const row = await prisma.promoterVenueAccess.findUnique({
    where: { id },
    select: { venueId: true, status: true },
  });
  if (!row || row.status !== PromoterVenueAccessStatus.PENDING) redirect("/venue?promoterAccess=invalid");
  if (!venueIds.includes(row.venueId)) redirect("/venue?promoterAccess=forbidden");

  const now = new Date();
  await prisma.promoterVenueAccess.update({
    where: { id },
    data: { status: PromoterVenueAccessStatus.APPROVED, respondedAt: now, updatedAt: now },
  });

  revalidatePath("/venue");
  revalidatePath("/promoter");
  redirect("/venue?promoterAccess=approved");
}

export async function rejectPromoterVenueAccessAction(formData: FormData) {
  const session = await requireVenueSession();
  const idRaw = formData.get("accessId");
  if (typeof idRaw !== "string" || !idRaw.trim()) redirect("/venue?promoterAccess=invalid");

  const id = idRaw.trim();
  const prisma = requirePrisma();
  const venueIds = await venueIdsForSession(session);

  const row = await prisma.promoterVenueAccess.findUnique({
    where: { id },
    select: { venueId: true, status: true },
  });
  if (!row || row.status !== PromoterVenueAccessStatus.PENDING) redirect("/venue?promoterAccess=invalid");
  if (!venueIds.includes(row.venueId)) redirect("/venue?promoterAccess=forbidden");

  const now = new Date();
  await prisma.promoterVenueAccess.update({
    where: { id },
    data: { status: PromoterVenueAccessStatus.REVOKED, respondedAt: now, updatedAt: now },
  });

  revalidatePath("/venue");
  revalidatePath("/promoter");
  redirect("/venue?promoterAccess=rejected");
}
