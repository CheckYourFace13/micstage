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
import {
  assignActiveBookingToSlot,
  moveOrSwapBookingBetweenSlots,
  softCancelSlotBooking,
  slotIsOpenForAssignment,
} from "@/lib/bookingSlotAssign";
import { notifyBookingTimeChanged, notifyBookingCancelledById } from "@/lib/bookingNotify";
import { assertHostOwnsNight, assertHostOwnsSlot } from "@/lib/host/hostNightAuth";
import { provisionHostNightLineup, publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { requirePrisma } from "@/lib/prisma";
import { scheduleWindowFromTimeInputs } from "@/lib/scheduleWindow";
import { minutesToTimeLabel } from "@/lib/time";

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

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: { booking: true },
      });
      if (!slot || !slotIsOpenForAssignment(slot.booking)) {
        throw new Error("SLOT_TAKEN");
      }
      await assignActiveBookingToSlot(tx, slotId, {
        performerName,
        performerEmail: formData.get("performerEmail")?.toString().trim().slice(0, 200) || null,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      redirect(`/promoter/nights/${owned.nightId}?error=slot_taken`);
    }
    throw e;
  }

  revalidatePath(`/nights/${owned.nightId}/lineup`);
  revalidatePath(`/promoter/nights/${owned.nightId}`);
  redirect(`/promoter/nights/${owned.nightId}?saved=1`);
}

export async function hostRemoveBookingAction(formData: FormData) {
  const session = await requirePromoterSession();
  const slotId = formData.get("slotId")?.toString().trim();
  if (!slotId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsSlot(prisma, session.promoterId, slotId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");

  const prior = await prisma.slot.findUnique({
    where: { id: slotId },
    select: { booking: { select: { id: true, cancelledAt: true } } },
  });
  const bookingId =
    prior?.booking && prior.booking.cancelledAt == null ? prior.booking.id : null;

  const didCancel = await prisma.$transaction(async (tx) => softCancelSlotBooking(tx, slotId));

  if (didCancel && bookingId) {
    try {
      await notifyBookingCancelledById(bookingId, "organizer");
    } catch (e) {
      console.error("[hostRemoveBooking] notify failed", e);
    }
  }

  revalidatePath(`/nights/${owned.nightId}/lineup`);
  revalidatePath(`/promoter/nights/${owned.nightId}`);
  redirect(`/promoter/nights/${owned.nightId}?saved=1`);
}

/** Move performer to another start time on the same night. Occupied destination → swap. */
export async function hostMoveBookingAction(formData: FormData) {
  const session = await requirePromoterSession();
  const fromSlotId = formData.get("fromSlotId")?.toString().trim();
  const toSlotId = formData.get("toSlotId")?.toString().trim();
  if (!fromSlotId || !toSlotId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsSlot(prisma, session.promoterId, fromSlotId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");
  const destOwned = await assertHostOwnsSlot(prisma, session.promoterId, toSlotId);
  if (!destOwned.ok || destOwned.nightId !== owned.nightId) {
    redirect("/promoter?promoter=forbidden");
  }

  const allowSwap = formData.get("allowSwap") === "on" || formData.get("allowSwap") === "true";

  const result = await prisma.$transaction(async (tx) =>
    moveOrSwapBookingBetweenSlots(tx, fromSlotId, toSlotId, { allowSwap }),
  );

  if (!result.ok) {
    const err =
      result.reason === "dest_taken"
        ? "slot_taken"
        : result.reason === "source_empty"
          ? "move_empty"
          : "move_failed";
    redirect(`/promoter/nights/${owned.nightId}?error=${err}`);
  }

  // Best-effort: notify performers whose start time changed (reminders already cleared).
  try {
    const night = await prisma.promoterNight.findUnique({
      where: { id: owned.nightId },
      select: { venue: { select: { name: true } } },
    });
    const venueName = night?.venue.name ?? "the open mic";
    const lineupPath = publicLineupPathForNightId(owned.nightId);
    for (const n of result.notify) {
      await notifyBookingTimeChanged({
        performerName: n.performerName,
        performerEmail: n.performerEmail,
        venueName,
        fromLabel: minutesToTimeLabel(n.fromStartMin),
        toLabel: minutesToTimeLabel(n.toStartMin),
        lineupPath,
      });
    }
  } catch (e) {
    console.error("[hostMoveBooking] notify failed", e);
  }

  revalidatePath(`/nights/${owned.nightId}/lineup`);
  revalidatePath(`/promoter/nights/${owned.nightId}`);
  redirect(`/promoter/nights/${owned.nightId}?saved=${result.mode === "swapped" ? "swapped" : "moved"}`);
}
