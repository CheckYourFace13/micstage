"use client";

import { useMemo, useState } from "react";
import type { VenuePerformanceFormat, Weekday } from "@/generated/prisma/client";
import { BOOKING_RESTRICTION_OPTIONS } from "@/lib/bookingRestrictionUi";
import { VENUE_PERFORMANCE_FORMAT_OPTIONS } from "@/lib/venuePerformanceFormat";
import { ALL_WEEKDAYS, computeWeeklySchedulePreview, weekdayFromIsoDateInTimeZone } from "@/lib/weeklySchedule";
import { weekdayToLabel } from "@/lib/time";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { LineupSlotTypesHelp } from "@/components/LineupSlotTypesHelp";
import { saveWeeklyScheduleAndGenerateSlots } from "./actions";

function timeToMinutesHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function coerceScheduleFormatDefault(f: VenuePerformanceFormat): VenuePerformanceFormat {
  return f === "COMEDY_SPOKEN_WORD" ? "COMEDY" : f;
}

type ScheduleMode = "recurring" | "one_event";

type Props = {
  venueId: string;
  venueTimeZone: string;
  todayIso: string;
  horizonDays: number;
  defaultSeriesStart: string;
  defaultSeriesEnd: string;
  defaultTitle: string;
  defaultDescription: string;
  bookingRestrictionMode: string;
  restrictionHoursBefore: number;
  onPremiseMaxDistanceMeters: number;
  defaultPerformanceFormat: VenuePerformanceFormat;
  /** Override default `mt-6 grid gap-4` on the root form when embedded in another card. */
  formClassName?: string;
};

export function WeeklyScheduleForm({
  venueId,
  venueTimeZone,
  todayIso,
  horizonDays,
  defaultSeriesStart,
  defaultSeriesEnd,
  defaultTitle,
  defaultDescription,
  bookingRestrictionMode,
  restrictionHoursBefore,
  onPremiseMaxDistanceMeters,
  defaultPerformanceFormat,
  formClassName = "mt-6 grid gap-4",
}: Props) {
  const plusDaysIso = (days: number) => {
    const d = new Date(`${todayIso}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("recurring");
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [seriesStart, setSeriesStart] = useState(defaultSeriesStart);
  const [seriesEnd, setSeriesEnd] = useState(defaultSeriesEnd);
  const [oneEventDate, setOneEventDate] = useState(defaultSeriesStart);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("21:00");
  const [slotMinutes, setSlotMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(() => new Set());

  const toggleWeekday = (w: Weekday) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  };

  const previewRangeStart = scheduleMode === "one_event" ? oneEventDate : seriesStart;
  const previewRangeEnd = scheduleMode === "one_event" ? oneEventDate : seriesEnd;

  const effectiveWeekdays = useMemo((): Weekday[] => {
    if (scheduleMode === "one_event") {
      return [weekdayFromIsoDateInTimeZone(oneEventDate, venueTimeZone)];
    }
    return [...weekdays];
  }, [scheduleMode, oneEventDate, venueTimeZone, weekdays]);

  const preview = useMemo(() => {
    const startMin = timeToMinutesHHMM(startTime);
    const endMin = timeToMinutesHHMM(endTime);
    if (startMin == null || endMin == null) return null;
    const s = new Date(`${previewRangeStart}T00:00:00.000Z`);
    const e = new Date(`${previewRangeEnd}T00:00:00.000Z`);
    return computeWeeklySchedulePreview({
      seriesStart: s,
      seriesEnd: e,
      weekdays: effectiveWeekdays,
      timeZone: venueTimeZone,
      startTimeMin: startMin,
      endTimeMin: endMin,
      slotMinutes,
      breakMinutes,
    });
  }, [
    previewRangeStart,
    previewRangeEnd,
    effectiveWeekdays,
    venueTimeZone,
    startTime,
    endTime,
    slotMinutes,
    breakMinutes,
  ]);

  const previewReady =
    scheduleMode === "one_event" ? effectiveWeekdays.length > 0 : weekdays.size > 0;

  return (
    <form action={saveWeeklyScheduleAndGenerateSlots} className={formClassName}>
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="scheduleMode" value={scheduleMode} />

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Open mic name</span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="Tuesday songwriter open mic"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Description for artists (optional)</span>
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={900}
          className="min-h-[5rem] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
          placeholder="Genre, vibe, signup rules, or what performers should expect."
        />
        <span className="text-xs text-white/45">Shown on the public lineup and anywhere artists see this open mic.</span>
      </label>

      <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4">
        <legend className="px-1 text-sm font-semibold text-white">How often?</legend>
        <p className="text-xs text-white/55">Pick a single night or a recurring weekly pattern.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
            <input
              type="radio"
              className="h-4 w-4 accent-[rgb(var(--om-neon))]"
              checked={scheduleMode === "one_event"}
              onChange={() => setScheduleMode("one_event")}
            />
            One event
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
            <input
              type="radio"
              className="h-4 w-4 accent-[rgb(var(--om-neon))]"
              checked={scheduleMode === "recurring"}
              onChange={() => setScheduleMode("recurring")}
            />
            Recurring weekly
          </label>
        </div>
      </fieldset>

      {scheduleMode === "one_event" ? (
        <>
          <input type="hidden" name="seriesStartDate" value={oneEventDate} />
          <input type="hidden" name="seriesEndDate" value={oneEventDate} />
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Open mic date</span>
            <input
              type="date"
              min={todayIso}
              max={plusDaysIso(horizonDays)}
              value={oneEventDate}
              onChange={(e) => setOneEventDate(e.target.value)}
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            />
          </label>
        </>
      ) : (
        <>
          <fieldset className="grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4">
            <legend className="px-1 text-sm font-semibold text-white">Which nights?</legend>
            <p className="text-xs text-white/55">Select every weekday this schedule applies to.</p>
            <div className="flex flex-wrap gap-2">
              {ALL_WEEKDAYS.map((w) => (
                <label
                  key={w}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    weekdays.has(w)
                      ? "border-[rgb(var(--om-neon))]/60 bg-[rgb(var(--om-neon))]/15 text-white"
                      : "border-white/15 bg-black/30 text-white/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={w}
                    checked={weekdays.has(w)}
                    onChange={() => toggleWeekday(w)}
                    className="h-4 w-4 accent-[rgb(var(--om-neon))]"
                  />
                  {weekdayToLabel(w).slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Booking window start</span>
              <input
                name="seriesStartDate"
                type="date"
                min={todayIso}
                max={plusDaysIso(horizonDays)}
                value={seriesStart}
                onChange={(e) => setSeriesStart(e.target.value)}
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Booking window end (max {horizonDays} days)</span>
              <input
                name="seriesEndDate"
                type="date"
                min={todayIso}
                max={plusDaysIso(horizonDays)}
                value={seriesEnd}
                onChange={(e) => setSeriesEnd(e.target.value)}
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
              />
            </label>
          </div>
        </>
      )}

      <p className="text-xs text-white/50">
        Times use your venue’s time zone from the address on file ({venueTimeZone}). You can’t change it here.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Start time</span>
          <input
            name="startTime"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
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
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
          />
        </label>
      </div>

      <fieldset className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4">
        <legend className="text-sm font-semibold text-white">Performance format</legend>
        <p className="text-xs text-white/55">
          {scheduleMode === "one_event"
            ? "What kinds of acts can book this night?"
            : "Applies to every selected weekday for this save. Use another save if different nights need different formats."}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Act types</span>
          <select
            name="performanceFormat"
            defaultValue={coerceScheduleFormatDefault(defaultPerformanceFormat)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          >
            {VENUE_PERFORMANCE_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Performance slot (minutes)</span>
          <input
            name="slotMinutes"
            type="number"
            min={1}
            required
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number.parseInt(e.target.value, 10) || 1)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Break between slots (minutes)</span>
          <input
            name="breakMinutes"
            type="number"
            min={0}
            required
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Number.parseInt(e.target.value, 10) || 0)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
          />
        </label>
      </div>

      <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <legend className="text-sm font-semibold text-white">Booking release rules</legend>
        <div className="grid gap-2">
          {BOOKING_RESTRICTION_OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
              <input
                type="radio"
                name="bookingRestrictionMode"
                value={o.value}
                defaultChecked={bookingRestrictionMode === o.value}
                className="h-4 w-4 accent-[rgb(var(--om-neon))]"
              />
              {o.label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Hours before start (X)</span>
            <input
              name="restrictionHoursBefore"
              type="number"
              min={0}
              max={48}
              defaultValue={restrictionHoursBefore}
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
              defaultValue={onPremiseMaxDistanceMeters}
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            />
          </label>
        </div>
      </fieldset>

      <LineupSlotTypesHelp className="mt-1" />

      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
        {preview && previewReady ? (
          <p>
            <span className="font-semibold text-white">Preview:</span> up to{" "}
            <span className="font-mono text-[rgb(var(--om-neon))]">{preview.totalNewSlots}</span> bookable slots across{" "}
            <span className="font-mono text-white">{preview.showNights}</span> show night
            {preview.showNights === 1 ? "" : "s"} (~{preview.slotsPerShow} slots per night) for the nights that match this
            save. Existing bookings stay intact. Other saved weeknights are refreshed too when you save.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-white">Preview:</span>{" "}
            {scheduleMode === "recurring"
              ? "Select at least one weekday and valid times to see slot counts."
              : "Pick a valid event date and times to see slot counts."}
          </p>
        )}
      </div>

      <FormSubmitButton
        label="Save schedule & generate slots"
        pendingLabel="Saving & generating…"
        className="h-12 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
      />
      <p className="text-xs text-white/50">
        {scheduleMode === "one_event" ? (
          <>
            Updates the template for that calendar weekday, generates slots for the date you picked, and keeps your existing
            booking window if it already covered that date (otherwise it extends to include it). Booked slots are left
            alone.
          </>
        ) : (
          <>
            Saves one recurring template per selected weekday (updates the latest template for that day if it already
            exists), then fills your booking window. Run again anytime to add missing slots or align open slots with new
            times — booked slots are left alone.
          </>
        )}
      </p>
    </form>
  );
}
