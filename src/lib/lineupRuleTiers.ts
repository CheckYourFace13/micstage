import type { BookingRestrictionMode } from "@/generated/prisma/client";
import type { TemplateRestrictionSlice } from "@/lib/slotBookingEffective";
import { effectiveSlotRestriction } from "@/lib/slotBookingEffective";
import type { SlotOverrideSlice } from "@/lib/slotBookingEffective";

/** Four simplified slot types in the venue lineup editor. */
export type LineupRuleTier = "OPEN" | "ATTENDEES" | "DAILY" | "HOUSE";

export const LINEUP_RULE_TIER_OPTIONS: { value: LineupRuleTier; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "ATTENDEES", label: "Attendees" },
  { value: "DAILY", label: "Daily" },
  { value: "HOUSE", label: "House" },
];

export function isLineupRuleTier(raw: string): raw is LineupRuleTier {
  return raw === "OPEN" || raw === "ATTENDEES" || raw === "DAILY" || raw === "HOUSE";
}

/** Map UI tier → per-slot override fields (explicit overrides; not inherit). */
export function prismaOverridesForLineupRuleTier(
  tier: LineupRuleTier,
  template: Pick<TemplateRestrictionSlice, "restrictionHoursBefore" | "onPremiseMaxDistanceMeters">,
): {
  bookingRestrictionModeOverride: BookingRestrictionMode;
  restrictionHoursBeforeOverride: number | null;
  onPremiseMaxDistanceMetersOverride: number | null;
} {
  switch (tier) {
    case "OPEN":
      return {
        bookingRestrictionModeOverride: "NONE",
        restrictionHoursBeforeOverride: null,
        onPremiseMaxDistanceMetersOverride: null,
      };
    case "ATTENDEES":
      return {
        bookingRestrictionModeOverride: "ON_PREMISE",
        restrictionHoursBeforeOverride: template.restrictionHoursBefore,
        onPremiseMaxDistanceMetersOverride: template.onPremiseMaxDistanceMeters,
      };
    case "DAILY":
      return {
        bookingRestrictionModeOverride: "ATTENDEE_DAY_OF",
        restrictionHoursBeforeOverride: null,
        onPremiseMaxDistanceMetersOverride: null,
      };
    case "HOUSE":
      return {
        bookingRestrictionModeOverride: "HOUSE_ONLY",
        restrictionHoursBeforeOverride: null,
        onPremiseMaxDistanceMetersOverride: null,
      };
  }
}

/**
 * Saving a slot row should keep inheriting the template rule unless the venue intentionally
 * picks a different tier. If they pick the same tier as the template, clear overrides.
 */
export function prismaOverridesForLineupRuleTierSelection(
  tier: LineupRuleTier,
  template: TemplateRestrictionSlice,
): {
  bookingRestrictionModeOverride: BookingRestrictionMode | null;
  restrictionHoursBeforeOverride: number | null;
  onPremiseMaxDistanceMetersOverride: number | null;
} {
  const templateTier = lineupRuleTierFromEffective(template);
  if (tier === templateTier) {
    return {
      bookingRestrictionModeOverride: null,
      restrictionHoursBeforeOverride: null,
      onPremiseMaxDistanceMetersOverride: null,
    };
  }
  return prismaOverridesForLineupRuleTier(tier, template);
}

/** Best-effort tier for dropdown from effective restriction (after overrides). */
export function lineupRuleTierFromEffective(eff: TemplateRestrictionSlice): LineupRuleTier {
  switch (eff.bookingRestrictionMode) {
    case "HOUSE_ONLY":
      return "HOUSE";
    case "NONE":
      return "OPEN";
    case "ATTENDEE_DAY_OF":
      return "DAILY";
    case "ON_PREMISE":
      return "ATTENDEES";
    case "HOURS_BEFORE":
    default:
      return "OPEN";
  }
}

export function lineupRuleTierFromSlot(
  slot: SlotOverrideSlice,
  template: TemplateRestrictionSlice,
): LineupRuleTier {
  return lineupRuleTierFromEffective(effectiveSlotRestriction(slot, template));
}
