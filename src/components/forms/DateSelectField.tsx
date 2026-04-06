"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  clampDayToMonth,
  daysInMonth,
  formatYmdParts,
  parseYmdStrict,
} from "@/lib/forms/dateSelectYmd";

const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function listYears(minYmd?: string, maxYmd?: string): number[] {
  const yNow = new Date().getUTCFullYear();
  let yMin = yNow - 100;
  let yMax = yNow + 30;
  const pMin = minYmd ? parseYmdStrict(minYmd) : null;
  const pMax = maxYmd ? parseYmdStrict(maxYmd) : null;
  if (pMin) yMin = pMin.y;
  if (pMax) yMax = pMax.y;
  if (yMin > yMax) [yMin, yMax] = [yMax, yMin];
  const out: number[] = [];
  for (let y = yMin; y <= yMax; y++) out.push(y);
  return out;
}

function allowedMonths(year: number | null, minYmd?: string, maxYmd?: string): { value: number; label: string }[] {
  if (year == null) return MONTHS;
  let lo = 1;
  let hi = 12;
  const pMin = minYmd ? parseYmdStrict(minYmd) : null;
  const pMax = maxYmd ? parseYmdStrict(maxYmd) : null;
  if (pMin && year === pMin.y) lo = pMin.m;
  if (pMax && year === pMax.y) hi = pMax.m;
  if (lo > hi) return [];
  return MONTHS.filter((x) => x.value >= lo && x.value <= hi);
}

function allowedDays(year: number | null, month: number | null, minYmd?: string, maxYmd?: string): number[] {
  if (year == null || month == null) return [];
  const dim = daysInMonth(year, month);
  let lo = 1;
  let hi = dim;
  const pMin = minYmd ? parseYmdStrict(minYmd) : null;
  const pMax = maxYmd ? parseYmdStrict(maxYmd) : null;
  if (pMin && year === pMin.y && month === pMin.m) lo = pMin.d;
  if (pMax && year === pMax.y && month === pMax.m) hi = pMax.d;
  if (lo > hi) return [];
  const out: number[] = [];
  for (let d = lo; d <= hi; d++) out.push(d);
  return out;
}

const selectClass =
  "h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white sm:px-3";

export type DateSelectFieldProps = {
  id?: string;
  label: string;
  /** Posted as a single YYYY-MM-DD field when set and the date is complete. */
  name?: string;
  value: string;
  /** Called only when the date is a complete valid YYYY-MM-DD inside optional min/max. Not called while the user is mid-edit. */
  onChange: (ymd: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  errorText?: string;
  className?: string;
};

export function DateSelectField({
  id: idProp,
  label,
  name,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  errorText,
  className = "",
}: DateSelectFieldProps) {
  const reactId = useId();
  const baseId = idProp ?? `date-select-${reactId.replace(/:/g, "")}`;
  const legendId = `${baseId}-legend`;

  const [y, setY] = useState<number | null>(() => parseYmdStrict(value)?.y ?? null);
  const [m, setM] = useState<number | null>(() => parseYmdStrict(value)?.m ?? null);
  const [d, setD] = useState<number | null>(() => parseYmdStrict(value)?.d ?? null);

  const lastEmitted = useRef<string>(parseYmdStrict(value) ? value : "");
  const dirty = useRef(false);

  // Sync tri-state from parent `value` when it changes externally (not while the user is mid-edit).
  /* eslint-disable react-hooks/set-state-in-effect -- controlled reset from props; no external subscription API */
  useEffect(() => {
    if (dirty.current) return;
    if (value === lastEmitted.current) return;
    const p = parseYmdStrict(value);
    if (p) {
      setY(p.y);
      setM(p.m);
      setD(p.d);
    } else {
      setY(null);
      setM(null);
      setD(null);
    }
    lastEmitted.current = value;
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tryEmitComplete = useCallback(
    (nextY: number | null, nextM: number | null, nextD: number | null) => {
      if (nextY == null || nextM == null || nextD == null) return;
      const dc = clampDayToMonth(nextY, nextM, nextD);
      let ymd = formatYmdParts(nextY, nextM, dc);
      const pMin = min ? parseYmdStrict(min) : null;
      const pMax = max ? parseYmdStrict(max) : null;
      const minS = pMin ? formatYmdParts(pMin.y, pMin.m, pMin.d) : null;
      const maxS = pMax ? formatYmdParts(pMax.y, pMax.m, pMax.d) : null;
      if (minS && ymd < minS) ymd = minS;
      if (maxS && ymd > maxS) ymd = maxS;
      const pClamp = parseYmdStrict(ymd);
      if (!pClamp) return;
      setY(pClamp.y);
      setM(pClamp.m);
      setD(pClamp.d);
      lastEmitted.current = ymd;
      dirty.current = false;
      onChange(ymd);
    },
    [min, max, onChange],
  );

  const years = useMemo(() => listYears(min, max), [min, max]);
  const months = useMemo(() => allowedMonths(y, min, max), [y, min, max]);
  const days = useMemo(() => allowedDays(y, m, min, max), [y, m, min, max]);

  const completeYmd =
    y != null && m != null && d != null ? formatYmdParts(y, m, clampDayToMonth(y, m, d)) : "";

  const onYear = (s: string) => {
    dirty.current = true;
    if (s === "") {
      setY(null);
      setM(null);
      setD(null);
      return;
    }
    const ny = Number.parseInt(s, 10);
    setY(ny);
    let nm = m;
    let nd = d;
    if (m != null && !allowedMonths(ny, min, max).some((x) => x.value === m)) {
      nm = null;
      nd = null;
    }
    if (nm != null && nd != null) {
      const allowed = allowedDays(ny, nm, min, max);
      if (!allowed.includes(nd)) nd = allowed.length ? allowed[0]! : null;
    }
    setM(nm);
    setD(nd);
    tryEmitComplete(ny, nm, nd);
  };

  const onMonth = (s: string) => {
    dirty.current = true;
    if (s === "") {
      setM(null);
      setD(null);
      return;
    }
    const nm = Number.parseInt(s, 10);
    setM(nm);
    let nd = d;
    if (y != null && d != null) {
      const allowed = allowedDays(y, nm, min, max);
      if (!allowed.includes(d)) nd = allowed.length ? allowed[0]! : null;
    }
    setD(nd);
    tryEmitComplete(y, nm, nd);
  };

  const onDay = (s: string) => {
    dirty.current = true;
    if (s === "") {
      setD(null);
      return;
    }
    const nd = Number.parseInt(s, 10);
    setD(nd);
    tryEmitComplete(y, m, nd);
  };

  return (
    <fieldset
      className={`grid gap-1 ${className}`}
      disabled={disabled}
      aria-describedby={errorText ? `${baseId}-err` : undefined}
    >
      <legend id={legendId} className="text-sm text-white/80">
        {label}
        {required ? <span className="text-amber-200/90"> *</span> : null}
      </legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <label htmlFor={`${baseId}-m`} className="sr-only">
          {label} — month
        </label>
        <select
          id={`${baseId}-m`}
          className={selectClass}
          value={m ?? ""}
          onChange={(e) => onMonth(e.target.value)}
          required={required}
          aria-invalid={Boolean(errorText)}
          aria-labelledby={legendId}
        >
          <option value="" disabled>
            Month
          </option>
          {months.map((mo) => (
            <option key={mo.value} value={mo.value}>
              {mo.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${baseId}-d`} className="sr-only">
          {label} — day
        </label>
        <select
          id={`${baseId}-d`}
          className={selectClass}
          value={d ?? ""}
          onChange={(e) => onDay(e.target.value)}
          required={required}
          aria-invalid={Boolean(errorText)}
          aria-labelledby={legendId}
        >
          <option value="" disabled>
            Day
          </option>
          {(y != null && m != null ? days : []).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <label htmlFor={`${baseId}-y`} className="sr-only">
          {label} — year
        </label>
        <select
          id={`${baseId}-y`}
          className={selectClass}
          value={y ?? ""}
          onChange={(e) => onYear(e.target.value)}
          required={required}
          aria-invalid={Boolean(errorText)}
          aria-labelledby={legendId}
        >
          <option value="" disabled>
            Year
          </option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      {name ? <input type="hidden" name={name} value={parseYmdStrict(completeYmd) ? completeYmd : ""} /> : null}
      {errorText ? (
        <p id={`${baseId}-err`} role="alert" className="text-xs text-amber-200/90">
          {errorText}
        </p>
      ) : null}
    </fieldset>
  );
}
