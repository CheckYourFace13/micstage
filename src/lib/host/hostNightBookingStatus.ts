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
 * FULL only when every performer slot has an active booking.
 * Restricted/RESERVED/HOUSE_ONLY empty slots do NOT make a night FULL.
 */
export function hostNightIsFullyBooked(counts: HostNightBookingCounts): boolean {
  return counts.totalSlots > 0 && counts.activeBooked === counts.totalSlots;
}

function performersBookedLabel(n: number): string {
  if (n <= 0) return "No performers booked";
  return `${n} performer${n === 1 ? "" : "s"} booked`;
}

export function formatHostNightBookingStatus(counts: HostNightBookingCounts): string {
  if (hostNightIsFullyBooked(counts)) {
    const n = counts.activeBooked;
    return `FULL · ${n} performer${n === 1 ? "" : "s"} booked`;
  }
  const base = performersBookedLabel(counts.activeBooked);
  if (counts.totalSlots > 0 && counts.openBookable === 0) {
    return `${base} · No public spots open`;
  }
  return base;
}
