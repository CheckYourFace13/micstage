export type SlotBookingDisplaySlice = {
  cancelledAt: Date | null;
  performerName: string;
  musicianId: string | null;
} | null;

/**
 * Artist / label shown on public lineups and venue grid.
 * Active booking wins; else manual venue label for empty slots.
 */
export function publicSlotArtistLabel(
  slot: { manualLineupLabel: string | null },
  booking: SlotBookingDisplaySlice,
): string {
  const active = booking && !booking.cancelledAt ? booking : null;
  if (active) return active.performerName.trim() || "—";
  const m = slot.manualLineupLabel?.trim();
  if (m) return m;
  return "";
}

export function slotHasMusicianBooking(booking: SlotBookingDisplaySlice): boolean {
  const active = booking && !booking.cancelledAt ? booking : null;
  return Boolean(active?.musicianId);
}
