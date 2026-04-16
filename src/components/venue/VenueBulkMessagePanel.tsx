"use client";

import Link from "next/link";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { VENUE_BULK_MESSAGE_SUBMIT_PATH } from "@/app/venue/bulkMessageActions";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";

type Props = {
  venueId: string;
  /** YYYY-MM-DD options (generated nights for this venue). */
  dateYmds: string[];
  /** Initially selected night (e.g. dashboard chip). */
  defaultYmd: string;
};

export function VenueBulkMessagePanel({ venueId, dateYmds, defaultYmd }: Props) {
  if (dateYmds.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-white/15 bg-black/30 p-4 sm:p-5">
      <div className="text-sm font-semibold text-white">Message all booked artists (this night)</div>
      <p className="mt-1 text-xs text-white/55">
        Sends one MicStage message (and email) to each artist with a MicStage account who has an active booking on the date
        you pick. Artists without accounts are skipped.
      </p>
      <form method="post" action={VENUE_BULK_MESSAGE_SUBMIT_PATH} className="mt-4 grid gap-3">
        <input type="hidden" name="venueId" value={venueId} />
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Open mic date</span>
          <select
            name="dateYmd"
            required
            defaultValue={dateYmds.includes(defaultYmd) ? defaultYmd : dateYmds[0]}
            className="h-11 rounded-md border border-white/15 bg-black/40 px-3 text-white"
          >
            {dateYmds.map((ymd) => (
              <option key={ymd} value={ymd}>
                {lineupNavLabelFromYmd(ymd)} ({ymd})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Message to all recipients</span>
          <textarea
            name="body"
            required
            rows={5}
            className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
            placeholder="e.g. Load-in update, parking, or schedule change…"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <FormSubmitButton
            label="Send to all booked artists"
            pendingLabel="Sending…"
            className={lineupPrimaryActionClass}
          />
          <Link href="/messages" className={lineupSecondaryActionClass}>
            Open inbox
          </Link>
        </div>
      </form>
    </div>
  );
}
