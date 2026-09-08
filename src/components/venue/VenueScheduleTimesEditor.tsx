"use client";

import { useState } from "react";
import type { Weekday } from "@/generated/prisma/client";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { updateEventTemplateTimes } from "@/app/venue/actions";
import { resolveScheduleEndMin, scheduleEndsNextDay, scheduleWindowLabel } from "@/lib/scheduleWindow";
import { minutesToTimeInputValue, weekdayToLabel } from "@/lib/time";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import { ALL_WEEKDAYS } from "@/lib/weeklySchedule";

type ScheduleRow = {
  id: string;
  title: string;
  weekday: Weekday;
  startTimeMin: number;
  endTimeMin: number;
};

function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function ScheduleRowForm({ venueId, row }: { venueId: string; row: ScheduleRow }) {
  const go = useVenuePortalRedirect();
  const [weekday, setWeekday] = useState<Weekday>(row.weekday);
  const [startTime, setStartTime] = useState(minutesToTimeInputValue(row.startTimeMin));
  const [endTime, setEndTime] = useState(minutesToTimeInputValue(row.endTimeMin));

  const startMin = timeInputToMinutes(startTime);
  const endMinRaw = timeInputToMinutes(endTime);
  const previewEndMin = startMin != null && endMinRaw != null ? resolveScheduleEndMin(startMin, endMinRaw) : null;

  return (
    <form
      action={async (fd) => go(await updateEventTemplateTimes(fd))}
      className="grid gap-3 rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4"
    >
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="templateId" value={row.id} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold text-white">{row.title}</div>
        <div className="text-xs text-white/55">
          Now live: {weekdayToLabel(row.weekday)} · {scheduleWindowLabel(row.startTimeMin, row.endTimeMin)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Day</span>
          <select
            name="weekday"
            value={weekday}
            onChange={(e) => setWeekday(e.target.value as Weekday)}
            className="h-12 rounded-md border border-white/15 bg-black/40 px-3 text-base text-white"
          >
            {ALL_WEEKDAYS.map((w) => (
              <option key={w} value={w}>
                {weekdayToLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Start time</span>
          <input
            name="startTime"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-12 rounded-md border border-white/15 bg-black/40 px-3 font-mono text-base text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">End time</span>
          <input
            name="endTime"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-12 rounded-md border border-white/15 bg-black/40 px-3 font-mono text-base text-white"
          />
        </label>
      </div>

      <p className="text-xs text-white/55">
        {previewEndMin != null ? (
          <>
            Saves as {weekdayToLabel(weekday)} · {scheduleWindowLabel(startMin!, previewEndMin)}.{" "}
            {scheduleEndsNextDay(previewEndMin)
              ? "This night runs past midnight — that’s allowed."
              : "Ends the same night."}
          </>
        ) : (
          "Pick a start and end time."
        )}
      </p>

      <FormSubmitButton
        label="Save times"
        pendingLabel="Saving…"
        className="h-12 w-full rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60 sm:w-fit"
      />
    </form>
  );
}

/** Day + start/end editing for schedules that already exist, without re-running full setup. */
export function VenueScheduleTimesEditor({ venueId, rows }: { venueId: string; rows: ScheduleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <ScheduleRowForm key={row.id} venueId={venueId} row={row} />
      ))}
    </div>
  );
}
