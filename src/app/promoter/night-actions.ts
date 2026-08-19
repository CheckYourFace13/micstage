"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePromoterSession } from "@/lib/authz";
import { assertHostOwnsNight, assertHostOwnsSlot } from "@/lib/host/hostNightAuth";
import { provisionHostNightLineup } from "@/lib/host/hostNightProvisioning";
import { requirePrisma } from "@/lib/prisma";

export async function updateHostNightSignupAction(formData: FormData) {
  const session = await requirePromoterSession();
  const nightId = formData.get("nightId")?.toString().trim();
  if (!nightId) redirect("/promoter?promoter=night_invalid");

  const prisma = requirePrisma();
  const owned = await assertHostOwnsNight(prisma, session.promoterId, nightId);
  if (!owned.ok) redirect("/promoter?promoter=forbidden");

  const signupEnabled = formData.get("signupEnabled") === "on" || formData.get("signupEnabled") === "true";
  const slotMinutes = Math.min(30, Math.max(3, Number.parseInt(formData.get("slotMinutes")?.toString() ?? "5", 10) || 5));

  await provisionHostNightLineup(prisma, nightId, { signupEnabled, slotMinutes });

  revalidatePath("/promoter");
  revalidatePath(`/nights/${nightId}/lineup`);
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
