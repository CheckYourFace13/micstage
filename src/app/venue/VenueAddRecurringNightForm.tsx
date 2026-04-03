import type { Venue, VenuePerformanceFormat } from "@/generated/prisma/client";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { createEventTemplate } from "./actions";
import { BOOKING_RESTRICTION_OPTIONS } from "@/lib/bookingRestrictionUi";
import { VENUE_PERFORMANCE_FORMAT_OPTIONS } from "@/lib/venuePerformanceFormat";

function coerceVenueFormatDefault(f: VenuePerformanceFormat): VenuePerformanceFormat {
  return f === "COMEDY_SPOKEN_WORD" ? "COMEDY" : f;
}

type VenueRecurringNightSlice = Pick<
  Venue,
  | "id"
  | "timeZone"
  | "performanceFormat"
  | "bookingRestrictionMode"
  | "restrictionHoursBefore"
  | "onPremiseMaxDistanceMeters"
>;

type Props = {
  venue: VenueRecurringNightSlice;
  todayIso: string;
  horizonDays: number;
  plusDaysIso: (days: number) => string;
  formClassName?: string;
};

export function VenueAddRecurringNightFormFields({
  venue: v,
  todayIso,
  horizonDays,
  plusDaysIso,
  formClassName = "mt-6 grid gap-3",
}: Props) {
  return (
    <form action={createEventTemplate} className={formClassName}>
      <input type="hidden" name="venueId" value={v.id} />
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Open mic night name (public)</span>
        <input
          name="title"
          required
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="Monday Songwriter Night"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Description for artists (optional)</span>
        <textarea
          name="description"
          rows={3}
          maxLength={900}
          className="min-h-[5rem] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
          placeholder="What artists should know about this night."
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Booking window start (today onward)</span>
          <input
            name="seriesStartDate"
            type="date"
            min={todayIso}
            max={plusDaysIso(horizonDays)}
            defaultValue={todayIso}
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Booking window end (max {horizonDays} days out)</span>
          <input
            name="seriesEndDate"
            type="date"
            min={todayIso}
            max={plusDaysIso(horizonDays)}
            defaultValue={plusDaysIso(horizonDays)}
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Weekday</span>
          <select name="weekday" className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white">
            <option value="MON">Monday</option>
            <option value="TUE">Tuesday</option>
            <option value="WED">Wednesday</option>
            <option value="THU">Thursday</option>
            <option value="FRI">Friday</option>
            <option value="SAT">Saturday</option>
            <option value="SUN">Sunday</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-1 text-xs text-white/50">
          <span className="font-medium text-white/70">Time zone</span>
          <span>
            Show times use <span className="text-white/75">{v.timeZone}</span> from your venue address — not editable here.
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Start time</span>
          <input
            name="startTime"
            type="time"
            required
            defaultValue="17:00"
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">End time</span>
          <input
            name="endTime"
            type="time"
            required
            defaultValue="21:00"
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Slot minutes</span>
          <input
            name="slotMinutes"
            type="number"
            min={1}
            defaultValue={25}
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Break minutes</span>
          <input
            name="breakMinutes"
            type="number"
            min={0}
            defaultValue={5}
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Performance format (this night, public)</span>
        <select
          name="performanceFormat"
          defaultValue={coerceVenueFormatDefault(v.performanceFormat)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
        >
          {VENUE_PERFORMANCE_FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
        <legend className="text-sm font-semibold text-white">Booking release rules (for this time block)</legend>

        <div className="grid gap-2">
          {BOOKING_RESTRICTION_OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
              <input
                type="radio"
                name="bookingRestrictionMode"
                value={o.value}
                defaultChecked={v.bookingRestrictionMode === o.value}
                className="h-4 w-4 accent-[rgb(var(--om-neon))]"
              />
              {o.label}
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">X hours before start</span>
            <input
              name="restrictionHoursBefore"
              type="number"
              min={0}
              max={48}
              defaultValue={v.restrictionHoursBefore ?? 6}
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">On-premise radius (meters)</span>
            <input
              name="onPremiseMaxDistanceMeters"
              type="number"
              min={50}
              max={10000}
              defaultValue={v.onPremiseMaxDistanceMeters ?? 1000}
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            />
          </label>
        </div>

        <p className="text-xs text-white/50">
          These rules apply to every generated slot inside this template (each template is a “time block”).
        </p>
      </fieldset>

      <FormSubmitButton
        label="Save available times"
        pendingLabel="Saving…"
        className="mt-2 h-11 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
      />
    </form>
  );
}
