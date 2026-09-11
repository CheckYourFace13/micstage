import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { appendQueryToPath, safePublicVenueReturnPath } from "@/lib/publicVenueReturnPath";
import { publicSignupBookBlockReason, slotRestrictionBlockReason, slotStartInstant } from "@/lib/venueBookingRules";
import { effectiveSlotRestriction } from "@/lib/slotBookingEffective";
import { assignActiveBookingToSlot } from "@/lib/bookingSlotAssign";
import { notifyBookingCreated } from "@/lib/bookingNotify";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { minutesToTimeLabel } from "@/lib/time";
import {
  touchVenuePerformerHistoryForManual,
  touchVenuePerformerHistoryForMusician,
} from "@/lib/venuePerformerHistory";

export const runtime = "nodejs";

class RedirectSignal extends Error {
  readonly path: string;

  constructor(path: string) {
    super(path);
    this.path = path;
  }
}

function reqString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}

function optString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function optNumber(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/venues");
  }

  const venueSlug = reqString(formData, "venueSlug");
  const slotId = reqString(formData, "slotId");
  const notes = optString(formData, "notes");

  const clientLat = optNumber(formData, "clientLat");
  const clientLng = optNumber(formData, "clientLng");
  const clientLocation = clientLat != null && clientLng != null ? { lat: clientLat, lng: clientLng } : undefined;

  const session = await getSession();
  const prisma = requirePrisma();
  const slotPreview = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
  });
  if (!slotPreview) throw new Error("Slot not found");
  if (slotPreview.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
  const venue = slotPreview.instance.template.venue;
  const returnBase = safePublicVenueReturnPath(venueSlug, optString(formData, "returnPath"), {
    nightId: slotPreview.instance.template.promoterNightId,
  });
  if (slotPreview.instance.isCancelled) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: "This date’s schedule was cancelled." }));
  }

  const hostNightId = slotPreview.instance.template.promoterNightId;
  let hostSignupEnabled: boolean | null = null;
  if (hostNightId) {
    const night = await prisma.promoterNight.findUnique({
      where: { id: hostNightId },
      select: { signupEnabled: true },
    });
    hostSignupEnabled = night?.signupEnabled ?? false;
  }

  const instanceBlock = publicSignupBookBlockReason({
    isHostNight: Boolean(hostNightId),
    hostSignupEnabled,
    venue,
    eventDate: slotPreview.instance.date,
  });
  if (instanceBlock) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: instanceBlock }));
  }

  // Slot must not have started yet (Host + Venue).
  const previewTz = slotPreview.instance.template.timeZone;
  const slotStartUtc = slotStartInstant(slotPreview.instance.date, slotPreview.startMin, previewTz);
  if (slotStartUtc.getTime() <= Date.now()) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: "That start time has already passed." }));
  }
  const effPreview = effectiveSlotRestriction(slotPreview, slotPreview.instance.template);
  const templateRestrictionBlock = slotRestrictionBlockReason(
    {
      bookingRestrictionMode: effPreview.bookingRestrictionMode,
      restrictionHoursBefore: effPreview.restrictionHoursBefore,
      onPremiseMaxDistanceMeters: effPreview.onPremiseMaxDistanceMeters,
      lat: venue.lat,
      lng: venue.lng,
    },
    slotStartUtc,
    new Date(),
    clientLocation,
    { restrictionTimeZone: previewTz },
  );
  if (templateRestrictionBlock) {
    return redirectTo(appendQueryToPath(returnBase, { bookError: templateRestrictionBlock }));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: { booking: true, instance: { include: { template: { include: { venue: true } } } } },
      });
      if (!slot) throw new Error("Slot not found");
      if (slot.instance.template.venue.slug !== venueSlug) throw new Error("Venue mismatch");
      if (slot.instance.isCancelled) {
        throw new RedirectSignal(appendQueryToPath(returnBase, { bookError: "This date’s schedule was cancelled." }));
      }
      if (slot.status !== "AVAILABLE") throw new Error("Slot is not available");
      if (slot.booking && !slot.booking.cancelledAt) throw new Error("Slot already booked");

      // Re-check restriction in transaction for consistency.
      const txVenue = slot.instance.template.venue;
      const txTz = slot.instance.template.timeZone;
      const txSlotStartUtc = slotStartInstant(slot.instance.date, slot.startMin, txTz);
      if (txSlotStartUtc.getTime() <= Date.now()) {
        throw new RedirectSignal(appendQueryToPath(returnBase, { bookError: "That start time has already passed." }));
      }
      const txHostNightId = slot.instance.template.promoterNightId;
      let txHostSignupEnabled: boolean | null = null;
      if (txHostNightId) {
        const n = await tx.promoterNight.findUnique({
          where: { id: txHostNightId },
          select: { signupEnabled: true },
        });
        txHostSignupEnabled = n?.signupEnabled ?? false;
      }
      const txInstanceBlock = publicSignupBookBlockReason({
        isHostNight: Boolean(txHostNightId),
        hostSignupEnabled: txHostSignupEnabled,
        venue: txVenue,
        eventDate: slot.instance.date,
      });
      if (txInstanceBlock) throw new RedirectSignal(appendQueryToPath(returnBase, { bookError: txInstanceBlock }));
      const effTx = effectiveSlotRestriction(slot, slot.instance.template);
      const txRestrictionBlock = slotRestrictionBlockReason(
        {
          bookingRestrictionMode: effTx.bookingRestrictionMode,
          restrictionHoursBefore: effTx.restrictionHoursBefore,
          onPremiseMaxDistanceMeters: effTx.onPremiseMaxDistanceMeters,
          lat: txVenue.lat,
          lng: txVenue.lng,
        },
        txSlotStartUtc,
        new Date(),
        clientLocation,
        { restrictionTimeZone: txTz },
      );
      if (txRestrictionBlock) {
        throw new RedirectSignal(appendQueryToPath(returnBase, { bookError: txRestrictionBlock }));
      }

      let performerName = optString(formData, "performerName") ?? "";
      let performerEmail = optString(formData, "performerEmail") ?? null;
      let musicianId: string | null = null;

      if (session?.kind === "musician") {
        const user = await tx.musicianUser.findUnique({ where: { id: session.musicianId } });
        if (user) {
          performerName = user.stageName;
          performerEmail = user.email;
          musicianId = user.id;
        }
      } else if (!performerName.trim()) {
        throw new Error("Name is required");
      }

      // Reuse cancelled Booking row when present — Booking.slotId is UNIQUE.
      await assignActiveBookingToSlot(tx, slot.id, {
        musicianId,
        performerName,
        performerEmail,
        notes: notes ?? null,
      });

      const vid = txVenue.id;
      if (musicianId) {
        await touchVenuePerformerHistoryForMusician(tx, vid, musicianId);
      } else if (performerName.trim()) {
        await touchVenuePerformerHistoryForManual(tx, vid, performerName.trim());
      }
    });
  } catch (e) {
    if (e instanceof RedirectSignal) return redirectTo(e.path);
    throw e;
  }

  // Best-effort notices (do not block booking success).
  try {
    const nightId = slotPreview.instance.template.promoterNightId;
    let hostEmail: string | null = null;
    if (nightId) {
      const night = await prisma.promoterNight.findUnique({
        where: { id: nightId },
        select: { series: { select: { promoter: { select: { email: true } } } } },
      });
      hostEmail = night?.series.promoter.email ?? null;
    } else {
      const owner = await prisma.venue.findUnique({
        where: { id: venue.id },
        select: { owner: { select: { email: true } } },
      });
      hostEmail = owner?.owner?.email ?? null;
    }
    const lineupYmdNotify = slotPreview.instance.date.toISOString().slice(0, 10);
    const lineupPath = nightId
      ? publicLineupPathForNightId(nightId)
      : `/venues/${venueSlug}/lineup/${lineupYmdNotify}`;
    const whenLabel = `${lineupYmdNotify} · ${minutesToTimeLabel(slotPreview.startMin)}`;
    const performerName =
      session?.kind === "musician"
        ? (await prisma.musicianUser.findUnique({ where: { id: session.musicianId }, select: { stageName: true } }))
            ?.stageName ?? "Performer"
        : (optString(formData, "performerName") ?? "Performer");
    const performerEmail =
      session?.kind === "musician"
        ? (await prisma.musicianUser.findUnique({ where: { id: session.musicianId }, select: { email: true } }))
            ?.email ?? null
        : (optString(formData, "performerEmail") ?? null);
    await notifyBookingCreated({
      performerName,
      performerEmail,
      hostOrVenueEmail: hostEmail,
      hostOrVenueLabel: nightId ? "Host" : "Venue",
      venueName: venue.name,
      whenLabel,
      lineupPath,
    });
  } catch (e) {
    console.error("[book-submit] notify failed", e);
  }

  const lineupYmd = slotPreview.instance.date.toISOString().slice(0, 10);
  revalidatePath(`/venues/${venueSlug}`);
  revalidatePath(`/venues/${venueSlug}/lineup`);
  revalidatePath(`/venues/${venueSlug}/lineup/${lineupYmd}`);
  if (slotPreview.instance.template.promoterNightId) {
    revalidatePath(`/nights/${slotPreview.instance.template.promoterNightId}/lineup`);
  }
  revalidatePath(ARTIST_DASHBOARD_HREF);
  return redirectTo(appendQueryToPath(returnBase, { booked: "1" }));
}
