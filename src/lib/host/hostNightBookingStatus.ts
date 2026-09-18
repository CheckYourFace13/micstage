/**
 * Host dashboard booking-status labels (display only — not booking logic).
 * Public-open counts reuse signup-live bookability rules exactly.
 */
import type { SignupLiveSlotSlice } from "@/lib/signupLiveStatus";
import { slotHasActiveBooking, slotIsPubliclyBookable } from "@/lib/signupLiveStatus";

export type HostNightBookingCounts = {
  totalSlots: number;
  activeBooked: number;
  /** Publicly bookable open spots (AVAILABLE + empty/cancelled + not HOUSE_ONLY). */
  openBookable: number;
  /** When false, never label the night FULL — signup-off ≠ full. */
  signupEnabled: boolean;
};

export function hostNightBookingCountsFromSlots(
  slots: SignupLiveSlotSlice[],
  opts?: { signupEnabled?: boolean },
): HostNightBookingCounts {
  const totalSlots = slots.length;
  let activeBooked = 0;
  let openBookable = 0;
  for (const s of slots) {
    if (slotHasActiveBooking(s)) activeBooked += 1;
    if (slotIsPubliclyBookable(s)) openBookable += 1;
  }
  return {
    totalSlots,
    activeBooked,
    openBookable,
    signupEnabled: opts?.signupEnabled !== false,
  };
}

/**
 * FULL only when public signup is on, there are slots, zero public-open spots,
 * and at least one active booking (occupancy — not signup merely disabled).
 */
export function hostNightIsFullyBooked(counts: HostNightBookingCounts): boolean {
  return (
    counts.signupEnabled &&
    counts.totalSlots > 0 &&
    counts.openBookable === 0 &&
    counts.activeBooked > 0
  );
}

export function formatHostNightBookingStatus(counts: HostNightBookingCounts): string {
  const n = counts.activeBooked;
  if (n <= 0) return "No performers booked";
  if (hostNightIsFullyBooked(counts)) {
    return `FULL · ${n} performer${n === 1 ? "" : "s"} booked`;
  }
  return `${n} performer${n === 1 ? "" : "s"} booked`;
}
