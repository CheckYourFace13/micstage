"use client";

import type { Booking, EventTemplate, Slot } from "@/generated/prisma/client";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { VenueSlotArtistField, type VenueSlotArtistSuggestion } from "@/components/venue/VenueSlotArtistField";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import { deleteVenueSlot, updateVenueSlotLine } from "@/app/venue/actions";
import { LINEUP_RULE_TIER_OPTIONS, lineupRuleTierFromSlot } from "@/lib/lineupRuleTiers";
import { publicSlotArtistLabel, slotHasMusicianBooking } from "@/lib/slotDisplay";
import { minutesToTimeInputValue } from "@/lib/time";

type Props = {
  venueId: string;
  slot: Slot & { booking: Booking | null };
  template: EventTemplate;
  /** Preserves dashboard day tab after save/delete (`YYYY-MM-DD`). */
  lineupDay?: string;
  performerSuggestions?: VenueSlotArtistSuggestion[];
};

function defaultArtistInputValue(slot: Slot, booking: Booking | null): string {
  const active = booking && !booking.cancelledAt ? booking : null;
  if (active && !active.musicianId) return active.performerName;
  return slot.manualLineupLabel ?? "";
}

/** Remount the row form when server slot data changes so uncontrolled inputs reflect saved overrides. */
function slotLineFormVersion(slot: Slot): string {
  return [
    slot.id,
    String(slot.updatedAt),
    slot.bookingRestrictionModeOverride ?? "",
    slot.restrictionHoursBeforeOverride ?? "",
    slot.onPremiseMaxDistanceMetersOverride ?? "",
    slot.startMin,
    slot.endMin,
  ].join("|");
}

export function VenueSlotManagementRow({
  venueId,
  slot,
  template,
  lineupDay,
  performerSuggestions = [],
}: Props) {
  const go = useVenuePortalRedirect();
  const lockedMusician = slotHasMusicianBooking(slot.booking);
  const defaultTier = lineupRuleTierFromSlot(slot, template);
  const displayName = publicSlotArtistLabel(slot, slot.booking);
  const lineFormKey = slotLineFormVersion(slot);

  return (
    <div className="flex flex-wrap items-stretch gap-2 border-b border-white/10 py-2.5 last:border-b-0">
      <form
        key={lineFormKey}
        action={async (fd) => go(await updateVenueSlotLine(fd))}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      >
        <input type="hidden" name="venueId" value={venueId} />
        <input type="hidden" name="slotId" value={slot.id} />
        {lineupDay ? <input type="hidden" name="lineupDay" value={lineupDay} /> : null}
        <label className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Time</span>
          <input
            name="startTime"
            type="time"
            defaultValue={minutesToTimeInputValue(slot.startMin)}
            className="h-9 w-[6.75rem] rounded-md border border-white/15 bg-black/40 px-1.5 font-mono text-sm text-white"
          />
        </label>
        <label className="min-w-[6rem] flex-1 flex-col gap-0.5 sm:min-w-[10rem]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Artist</span>
          {lockedMusician ? (
            <span
              className="flex h-9 items-center truncate rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 text-sm text-white/95"
              title="Booked by a MicStage artist — name can’t be edited here."
            >
              {displayName}
            </span>
          ) : (
            <VenueSlotArtistField
              key={`${lineFormKey}-artist`}
              venueId={venueId}
              suggestions={performerSuggestions}
              defaultDisplay={defaultArtistInputValue(slot, slot.booking)}
            />
          )}
        </label>
        <label className="flex min-w-[8.5rem] flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Booking</span>
          <select
            name="lineupRuleTier"
            defaultValue={defaultTier}
            className="h-9 rounded-md border border-white/15 bg-black/40 px-1.5 text-xs text-white"
          >
            {LINEUP_RULE_TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <FormSubmitButton
            label="Save"
            pendingLabel="…"
            className="h-9 rounded-md bg-[rgb(var(--om-neon))] px-3 text-xs font-bold text-black hover:brightness-110 disabled:opacity-60"
          />
        </div>
      </form>
      <form action={async (fd) => go(await deleteVenueSlot(fd))} className="flex items-end">
        <input type="hidden" name="venueId" value={venueId} />
        <input type="hidden" name="slotId" value={slot.id} />
        {lineupDay ? <input type="hidden" name="lineupDay" value={lineupDay} /> : null}
        <FormSubmitButton
          label="Delete"
          pendingLabel="…"
          disabled={lockedMusician}
          className="h-9 rounded-md border border-red-400/40 bg-red-500/10 px-3 text-xs font-semibold text-red-200/95 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </form>
    </div>
  );
}
