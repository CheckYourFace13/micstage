import type { BookingRestrictionMode } from "@/generated/prisma/client";

export type SlotOverrideSlice = {
  bookingRestrictionModeOverride: BookingRestrictionMode | null;
  restrictionHoursBeforeOverride: number | null;
  onPremiseMaxDistanceMetersOverride: number | null;
};

export type TemplateRestrictionSlice = {
  bookingRestrictionMode: BookingRestrictionMode;
  restrictionHoursBefore: number;
  onPremiseMaxDistanceMeters: number;
};

/** Null overrides on the slot mean “use the template (schedule block) defaults.” */
export function effectiveSlotRestriction(
  slot: SlotOverrideSlice,
  template: TemplateRestrictionSlice,
): TemplateRestrictionSlice {
  return {
    bookingRestrictionMode: slot.bookingRestrictionModeOverride ?? template.bookingRestrictionMode,
    restrictionHoursBefore: slot.restrictionHoursBeforeOverride ?? template.restrictionHoursBefore,
    onPremiseMaxDistanceMeters: slot.onPremiseMaxDistanceMetersOverride ?? template.onPremiseMaxDistanceMeters,
  };
}

export function slotHasBookingRuleOverride(slot: SlotOverrideSlice): boolean {
  return slot.bookingRestrictionModeOverride != null;
}
