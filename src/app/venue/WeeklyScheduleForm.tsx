"use client";

import { useMemo, useState } from "react";
import type { Weekday } from "@/generated/prisma/client";
import { ALL_WEEKDAYS, computeWeeklySchedulePreview } from "@/lib/weeklySchedule";
import { weekdayToLabel } from "@/lib/time";
import { saveWeeklyScheduleAndGenerateSlots } from "./actions";

function timeToMinutesHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

type Props = {
  venueId: string;
  venueTimeZone: string;
  todayIso: string;
  horizonDays: number;
  defaultSeriesStart: string;
  defaultSeriesEnd: string;
  defaultTitle: string;
  bookingRestrictionMode: string;
  restrictionHoursBefore: number;
  onPremiseMaxDistanceMeters: number;
};

export function WeeklyScheduleForm({
  venueId,
  venueTimeZone,
  todayIso,
  horizonDays,
  defaultSeriesStart,
  defaultSeriesEnd,
  defaultTitle,
  bookingRestrictionMode,
  restrictionHoursBefore,
  onPremiseMaxDistanceMeters,
}: Props) {
  const plusDaysIso = (days: number) => {
    const d = new Date(`${todayIso}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const [title, setTitle] = useState(defaultTitle);
  const [seriesStart, setSeriesStart] = useState(defaultSeriesStart);
  const [seriesEnd, setSeriesEnd] = useState(defaultSeriesEnd);
  const [timeZone, setTimeZone] = useState(venueTimeZone);
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

  const preview = useMemo(() => {
    const startMin = timeToMinutesHHMM(startTime);
    const endMin = timeToMinutesHHMM(endTime);
    if (startMin == null || endMin == null) return null;
    const s = new Date(`${seriesStart}T00:00:00.000Z`);
    const e = new Date(`${seriesEnd}T00:00:00.000Z`);
    return computeWeeklySchedulePreview({
      seriesStart: s,
      seriesEnd: e,
      weekdays: [...weekdays],
      timeZone,
      startTimeMin: startMin,
      endTimeMin: endMin,
      slotMinutes,
      breakMinutes,
    });
  }, [seriesStart, seriesEnd, weekdays, timeZone, startTime, endTime, slotMinutes, breakMinutes]);

  return (
    <form action={saveWeeklyScheduleAndGenerateSlots} className="mt-6 grid gap-4">
      <input type="hidden" name="venueId" value={venueId} />

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Open mic name</span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="Weekly open mic"
        />
      </label>

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

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Time zone</span>
        <input
          name="timeZone"
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="America/Chicago"
        />
      </label>

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
          {[
            { value: "NONE", label: "Book anytime within the booking window" },
            { value: "ATTENDEE_DAY_OF", label: "Reserved for attendees (unlock on the day)" },
            { value: "HOURS_BEFORE", label: "Unlock up to X hours before start" },
            { value: "ON_PREMISE", label: "On-premise only + X hours before start" },
          ].map((o) => (
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

      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
        {preview && weekdays.size > 0 ? (
          <p>
            <span className="font-semibold text-white">Preview:</span> up to{" "}
            <span className="font-mono text-[rgb(var(--om-neon))]">{preview.totalNewSlots}</span> bookable slots across{" "}
            <span className="font-mono text-white">{preview.showNights}</span> show night
            {preview.showNights === 1 ? "" : "s"} (~{preview.slotsPerShow} slots per night) for the nights you checked.
            Existing bookings stay intact. If you already have other recurring nights saved, those are refreshed too when you
            save.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-white">Preview:</span> select at least one weekday and valid times to
            see slot counts.
          </p>
        )}
      </div>

      <button
        type="submit"
        className="h-12 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
      >
        Save schedule &amp; generate slots
      </button>
      <p className="text-xs text-white/50">
        Saves one recurring template per selected weekday (updates the latest template for that day if it already
        exists), then fills your booking window. Run again anytime to add missing slots or align open slots with new
        times — booked slots are left alone.
      </p>
    </form>
  );
}
