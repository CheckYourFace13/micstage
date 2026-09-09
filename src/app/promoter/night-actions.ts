"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import {
  HOST_DEFAULT_PERFORMANCE_MINUTES,
  HOST_DEFAULT_START_EVERY_MINUTES,
  parseArtistTimingFromForm,
} from "@/lib/artistTiming";
import { requirePromoterSession } from "@/lib/authz";
import { assertHostOwnsNight, assertHostOwnsSlot } from "@/lib/host/hostNightAuth";
import { provisionHostNightLineup } from "@/lib/host/hostNightProvisioning";
import { requirePrisma } from "@/lib/prisma";
import { scheduleWindowFromTimeInputs } from "@/lib/scheduleWindow";

/** `YYYY-MM-DD` as UTC midnight — same storage convention as `PromoterNight.date`. */
function parseYmdUtc(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export async function updateHostNightSignupAction(formData: FormData) {
  const session = await requirePromoterSession();
  const nightId = formData.get("nightId")?.toString().trim();
  if (!nightId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsNight(prisma, session.promoterId, nightId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");

  const signupEnabled = formData.get("signupEnabled") === "on" || formData.get("signupEnabled") === "true";
  const timing = parseArtistTimingFromForm(formData, {
    performanceMinutes: HOST_DEFAULT_PERFORMANCE_MINUTES,
    artistStartEveryMinutes: HOST_DEFAULT_START_EVERY_MINUTES,
  });
  if (!timing.ok) redirect(`/promoter/nights/${nightId}?error=invalid_timing`);

  // End time at or before start = runs past midnight (9:00 PM → 1:00 AM), not an error.
  const window = scheduleWindowFromTimeInputs(
    formData.get("startTime")?.toString(),
    formData.get("endTime")?.toString(),
  );
  if (!window) redirect(`/promoter/nights/${nightId}?error=invalid_time`);

  const dateRaw = formData.get("date")?.toString().trim();
  if (dateRaw) {
    const date = parseYmdUtc(dateRaw);
    if (!date) redirect(`/promoter/nights/${nightId}?error=invalid_date`);
    try {
      await prisma.promoterNight.update({ where: { id: nightId }, data: { date } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        redirect(`/promoter/nights/${nightId}?error=duplicate_date`);
      }
      throw e;
    }
  }

  // Series-level rules so every future night inherits them without retyping.
  if (formData.has("artistRules")) {
    const artistRules = formData.get("artistRules")?.toString() ?? "";
    const night = await prisma.promoterNight.findUnique({
      where: { id: nightId },
      select: { seriesId: true },
    });
    if (night) {
      await prisma.promoterSeries.update({
        where: { id: night.seriesId },
        data: { artistRules: artistRules.trim().slice(0, 4000) || null },
      });
    }
  }

  const provision = {
    signupEnabled,
    slotMinutes: timing.stored.slotMinutes,
    breakMinutes: timing.stored.breakMinutes,
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
  };

  await provisionHostNightLineup(prisma, nightId, provision);

  // Optional: push the same day/times/signup/timing settings onto later nights in this series.
  if (formData.get("applyFutureNights") === "on") {
    const night = await prisma.promoterNight.findUnique({
      where: { id: nightId },
      select: { seriesId: true, date: true },
    });
    if (night) {
      const future = await prisma.promoterNight.findMany({
        where: { seriesId: night.seriesId, date: { gt: night.date } },
        select: { id: true },
        orderBy: { date: "asc" },
        take: 52,
      });
      for (const row of future) {
        await provisionHostNightLineup(prisma, row.id, provision);
      }
    }
  }

  revalidatePath("/promoter");
  revalidatePath(`/nights/${nightId}/lineup`);
  revalidatePath(`/promoter/nights/${nightId}`);
  redirect(`/promoter/nights/${nightId}?saved=1`);
}

export async function hostHouseBookSlotAction(formData: FormData) {
  const session = await requirePromoterSession();
  const slotId = formData.get("slotId")?.toString().trim();
  const performerName = formData.get("performerName")?.toString().trim();
  if (!slotId || !performerName) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsSlot(prisma, session.promoterId, slotId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { booking: true },
  });
  if (!slot || slot.booking) redirect(`/promoter/nights/${owned.nightId}?error=slot_taken`);

  await prisma.booking.create({
    data: {
      slotId,
      performerName: performerName.slice(0, 120),
      performerEmail: formData.get("performerEmail")?.toString().trim().slice(0, 200) || null,
    },
  });
  await prisma.slot.update({ where: { id: slotId }, data: { status: "RESERVED" } });

  revalidatePath(`/nights/${owned.nightId}/lineup`);
  redirect(`/promoter/nights/${owned.nightId}?saved=1`);
}

export async function hostRemoveBookingAction(formData: FormData) {
  const session = await requirePromoterSession();
  const slotId = formData.get("slotId")?.toString().trim();
  if (!slotId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsSlot(prisma, session.promoterId, slotId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");

  await prisma.booking.updateMany({
    where: { slotId, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  await prisma.slot.update({ where: { id: slotId }, data: { status: "AVAILABLE", manualLineupLabel: null } });

  revalidatePath(`/nights/${owned.nightId}/lineup`);
  redirect(`/promoter/nights/${owned.nightId}?saved=1`);
}
