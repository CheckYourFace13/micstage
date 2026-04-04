"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { deleteVenueOpenMicDay } from "@/app/venue/actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";

type Props = {
  venueId: string;
  dateYmd: string;
  nightLabel: string;
  /** Selected night title — stays visually primary on the left. */
  children: ReactNode;
};

export function VenueDeleteOpenMicDayPanel({ venueId, dateYmd, nightLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const go = useVenuePortalRedirect();

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">{children}</div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-red-400/35 bg-transparent px-2 py-1 text-[11px] font-medium text-red-300/90 hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-200"
          >
            Delete this open mic
          </button>
        ) : null}
      </div>

      {open ? (
        <form action={async (fd) => go(await deleteVenueOpenMicDay(fd))} className="mt-2 max-w-lg rounded-md border border-red-400/30 bg-red-950/20 p-2.5">
          <input type="hidden" name="venueId" value={venueId} />
          <input type="hidden" name="dateYmd" value={dateYmd} />
          <p className="text-[11px] leading-relaxed text-white/70">
            Remove <span className="font-semibold text-white">{nightLabel}</span> (
            <span className="font-mono text-white/80">{dateYmd}</span>) from MicStage? This deletes all generated slots and
            bookings for that calendar night across your schedule blocks. Your recurring templates stay — you can generate this
            date again later.
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-amber-200/85">
            You cannot delete a night that still has an active MicStage artist booking — cancel those first.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FormSubmitButton
              label="Delete this open mic"
              pendingLabel="Removing…"
              className="h-8 rounded-md border border-red-400/45 bg-red-500/15 px-2.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 rounded-md border border-white/12 bg-white/5 px-2.5 text-[11px] font-medium text-white/75 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
