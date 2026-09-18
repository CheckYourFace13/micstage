/**
 * Host dashboard booking-status labels (display only — not booking logic).
 */

export type HostNightBookingCounts = {
  totalSlots: number;
  activeBooked: number;
  openBookable: number;
};

export function hostNightBookingCountsFromSlots(
  slots: Array<{ booking: { cancelledAt: Date | null } | null }>,
): HostNightBookingCounts {
  const totalSlots = slots.length;
  let activeBooked = 0;
  let openBookable = 0;
  for (const s of slots) {
    const active = Boolean(s.booking && s.booking.cancelledAt == null);
    if (active) activeBooked += 1;
    else openBookable += 1;
  }
  return { totalSlots, activeBooked, openBookable };
}

/** True only when every performer slot is occupied (no open/bookable slots remain). */
export function hostNightIsFullyBooked(counts: HostNightBookingCounts): boolean {
  return counts.totalSlots > 0 && counts.openBookable === 0;
}

export function formatHostNightBookingStatus(counts: HostNightBookingCounts): string {
  const n = counts.activeBooked;
  if (n <= 0) return "No performers booked";
  if (hostNightIsFullyBooked(counts)) {
    return `FULL · ${n} performer${n === 1 ? "" : "s"} booked`;
  }
  return `${n} performer${n === 1 ? "" : "s"} booked`;
}
