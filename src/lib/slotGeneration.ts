export type SlotSpec = {
  startMin: number;
  endMin: number;
};

export function generateSlotsForWindow(input: {
  startTimeMin: number;
  endTimeMin: number;
  /** Performance length (minutes on stage). */
  slotMinutes: number;
  /**
   * Quiet minutes after a performance before the next artist STARTS.
   * Start interval = slotMinutes + breakMinutes. Prefer the Host/Venue UI pair
   * `performanceMinutes` + `artistStartEveryMinutes` (see `artistTiming.ts`).
   */
  breakMinutes: number;
}): SlotSpec[] {
  const { startTimeMin, endTimeMin, slotMinutes, breakMinutes } = input;
  if (slotMinutes <= 0) throw new Error("slotMinutes must be > 0");
  if (breakMinutes < 0) throw new Error("breakMinutes must be >= 0");
  if (endTimeMin <= startTimeMin) throw new Error("endTimeMin must be > startTimeMin");

  const slots: SlotSpec[] = [];
  let cursor = startTimeMin;
  while (cursor + slotMinutes <= endTimeMin) {
    slots.push({ startMin: cursor, endMin: cursor + slotMinutes });
    cursor = cursor + slotMinutes + breakMinutes;
  }
  return slots;
}

