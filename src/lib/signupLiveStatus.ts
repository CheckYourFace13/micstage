import { absoluteUrl } from "@/lib/publicSeo";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";

export type SignupLiveSlotSlice = {
  status: string;
  booking: { cancelledAt: Date | null } | null;
  bookingRestrictionModeOverride?: string | null;
};

export type SignupLiveInput = {
  signupEnabled: boolean;
  hasScheduleInstance: boolean;
  isCancelled?: boolean;
  slots: SignupLiveSlotSlice[];
  /** When true, HOUSE_ONLY slots do not count as public open spots */
  excludeHouseOnly?: boolean;
  nightId?: string;
  venueSlug?: string;
  lineupDateYmd?: string;
};

export type SignupLiveStatus = {
  live: boolean;
  headline: string;
  detail: string;
  openSpots: number;
  filledSpots: number;
  totalSlots: number;
  blockers: string[];
  signupPath: string | null;
};

function isPublicOpen(slot: SignupLiveSlotSlice, excludeHouseOnly: boolean): boolean {
  if (excludeHouseOnly && slot.bookingRestrictionModeOverride === "HOUSE_ONLY") return false;
  if (slot.status !== "AVAILABLE") return false;
  if (slot.booking && slot.booking.cancelledAt == null) return false;
  return true;
}

function isFilled(slot: SignupLiveSlotSlice): boolean {
  return Boolean(slot.booking && slot.booking.cancelledAt == null);
}

/**
 * Truthful Host/Venue "performer signup is live" status.
 * LIVE only when signup is enabled, schedule exists, and at least one publicly bookable open spot.
 */
export function computeSignupLiveStatus(input: SignupLiveInput): SignupLiveStatus {
  const excludeHouseOnly = input.excludeHouseOnly !== false;
  const totalSlots = input.slots.length;
  const openSpots = input.slots.filter((s) => isPublicOpen(s, excludeHouseOnly)).length;
  const filledSpots = input.slots.filter(isFilled).length;
  const blockers: string[] = [];

  if (input.isCancelled) blockers.push("This night’s schedule was cancelled.");
  if (!input.hasScheduleInstance) blockers.push("Schedule is missing — save day and times to create slots.");
  if (!input.signupEnabled) blockers.push("Performer signup is turned off.");
  if (input.hasScheduleInstance && totalSlots === 0) blockers.push("No time slots on this night yet.");
  if (input.signupEnabled && input.hasScheduleInstance && totalSlots > 0 && openSpots === 0) {
    blockers.push(filledSpots >= totalSlots ? "All spots are filled." : "No publicly bookable open spots.");
  }

  const signupPath = input.nightId
    ? publicLineupPathForNightId(input.nightId)
    : input.venueSlug && input.lineupDateYmd
      ? `/venues/${input.venueSlug}/lineup/${input.lineupDateYmd}`
      : null;

  const live =
    !input.isCancelled &&
    input.signupEnabled &&
    input.hasScheduleInstance &&
    totalSlots > 0 &&
    openSpots > 0 &&
    Boolean(signupPath);

  if (live) {
    return {
      live: true,
      headline: "PERFORMER SIGNUP IS LIVE",
      detail: `${openSpots} open spot${openSpots === 1 ? "" : "s"} · performers can book from the public page`,
      openSpots,
      filledSpots,
      totalSlots,
      blockers: [],
      signupPath,
    };
  }

  return {
    live: false,
    headline: "SIGNUP IS NOT LIVE",
    detail: blockers[0] ?? "Signup is not ready yet.",
    openSpots,
    filledSpots,
    totalSlots,
    blockers: blockers.length ? blockers : ["Signup is not ready yet."],
    signupPath,
  };
}

export function signupLiveAbsoluteUrl(status: SignupLiveStatus): string | null {
  return status.signupPath ? absoluteUrl(status.signupPath) : null;
}
