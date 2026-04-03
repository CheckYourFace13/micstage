"use client";

import { useState } from "react";
import { deleteVenueOpenMicDay } from "@/app/venue/actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type Props = {
  venueId: string;
  dateYmd: string;
  nightLabel: string;
};

export function VenueDeleteOpenMicDayPanel({ venueId, dateYmd, nightLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 max-w-xl rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-left text-sm font-medium text-red-200/90 underline decoration-red-400/40 underline-offset-2 hover:text-red-100"
        >
          Delete this open mic day…
        </button>
      ) : (
        <form action={deleteVenueOpenMicDay} className="grid gap-3">
          <input type="hidden" name="venueId" value={venueId} />
          <input type="hidden" name="dateYmd" value={dateYmd} />
          <p className="text-xs leading-relaxed text-white/70">
            Remove <span className="font-semibold text-white">{nightLabel}</span> (
            <span className="font-mono text-white/80">{dateYmd}</span>) from MicStage? This deletes all generated slots and
            bookings for that calendar night across your schedule blocks. Your recurring templates stay — you can generate this
            date again later.
          </p>
          <p className="text-xs font-medium text-amber-200/85">
            You cannot delete a night that still has an active MicStage artist booking — cancel those first.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <FormSubmitButton
              label="Delete this open mic day"
              pendingLabel="Removing…"
              className="h-9 rounded-md border border-red-400/50 bg-red-500/15 px-3 text-xs font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
