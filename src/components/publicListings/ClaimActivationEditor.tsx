"use client";

import { useState } from "react";

type TemplateRow = {
  id: string;
  title: string;
  weekday: string;
  startTimeMin: number;
  endTimeMin: number;
  timeZone: string;
  slotMinutes: number;
  breakMinutes: number;
  isPublic: boolean;
  performanceFormat: string;
  bookingRestrictionMode: string;
};

/** Post-claim performer access: booking stays off until option 3. */
export type ActivationPerformerMode =
  | "info_only"
  | "interest_waitlist"
  | "micstage_booking";

export function ClaimActivationEditor(props: {
  venue: {
    id: string;
    slug: string;
    name: string;
    formattedAddress: string;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    bookingOpensDaysAhead: number;
    bookingRestrictionMode: string;
  };
  listing: {
    slug: string;
    name: string;
    signupMethod: string | null;
    cost: string | null;
    ageRestriction: string | null;
    equipmentNotes: string | null;
    accessibilityNotes: string | null;
    lastVerifiedAt: Date | string | null;
    websiteUrl: string | null;
  } | null;
  templates: TemplateRow[];
}) {
  const [name, setName] = useState(props.venue.name);
  const [websiteUrl, setWebsiteUrl] = useState(props.venue.websiteUrl ?? "");
  const [slotMinutes, setSlotMinutes] = useState(props.templates[0]?.slotMinutes ?? 10);
  const [breakMinutes, setBreakMinutes] = useState(props.templates[0]?.breakMinutes ?? 0);
  const [bookingMode, setBookingMode] = useState(
    props.venue.bookingRestrictionMode === "NONE" ? "HOURS_BEFORE" : props.venue.bookingRestrictionMode || "HOURS_BEFORE",
  );
  const [advanceDays, setAdvanceDays] = useState(props.venue.bookingOpensDaysAhead || 60);
  const [performerMode, setPerformerMode] = useState<ActivationPerformerMode>("info_only");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [listingUrl] = useState(
    typeof window !== "undefined"
      ? `${window.location.origin}/open-mics/${props.listing?.slug ?? props.venue.slug}`
      : props.listing
        ? `/open-mics/${props.listing.slug}`
        : `/venues/${props.venue.slug}`,
  );

  const publishSchedule = performerMode === "info_only" || performerMode === "micstage_booking" || performerMode === "interest_waitlist";
  const enableBooking = performerMode === "micstage_booking";

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch(`/api/claim/activate/${encodeURIComponent(props.venue.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          websiteUrl: websiteUrl || null,
          slotMinutes,
          breakMinutes,
          bookingRestrictionMode: enableBooking ? bookingMode : "NONE",
          bookingOpensDaysAhead: advanceDays,
          publishSchedule,
          enableBooking,
          performerMode,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? "Save failed");
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      setError("Network error");
    }
  }

  function fmtMin(m: number) {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, "0");
    return `${h}:${mm}`;
  }

  return (
    <form onSubmit={(e) => void onSave(e)} className="grid gap-5">
      <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
        Default after claim: <strong className="font-semibold">Information published; online booking disabled</strong>.
        Imported schedules do not make this venue bookable until you choose MicStage booking below.
      </p>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Venue</h2>
        <label className="grid gap-1 text-sm">
          <span className="text-white/70">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3" />
        </label>
        <p className="text-sm text-white/60">{props.venue.formattedAddress}</p>
        <label className="grid gap-1 text-sm">
          <span className="text-white/70">Website</span>
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="h-10 rounded-md border border-white/15 bg-black/40 px-3" />
        </label>
        {props.listing?.lastVerifiedAt ? (
          <p className="text-xs text-white/45">
            Source verified {new Date(props.listing.lastVerifiedAt).toLocaleDateString()}
            {props.listing.signupMethod ? ` · signup: ${props.listing.signupMethod}` : ""}
            {props.listing.cost ? ` · cost: ${props.listing.cost}` : ""}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Schedule visibility</h2>
        <p className="text-sm text-white/60">
          Confirm imported event information. Publishing a schedule does not enable online booking by itself.
        </p>
        {props.templates.length === 0 ? (
          <p className="text-sm text-white/60">No schedule rows were imported. Add one from the dashboard after setup.</p>
        ) : (
          <ul className="space-y-2 text-sm text-white/80">
            {props.templates.map((t) => (
              <li key={t.id}>
                {t.title} — {t.weekday} {fmtMin(t.startTimeMin)}–{fmtMin(t.endTimeMin)} ({t.timeZone})
                {t.isPublic ? " · public" : " · draft (not bookable)"}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Slot length (min)</span>
            <input
              type="number"
              min={5}
              max={60}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
              className="h-10 rounded-md border border-white/15 bg-black/40 px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/70">Break (min)</span>
            <input
              type="number"
              min={0}
              max={30}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="h-10 rounded-md border border-white/15 bg-black/40 px-3"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Performer signup method</h2>
        <p className="text-sm text-white/60">
          Choose how performers interact with your page. Online signups are optional — you can keep the page
          informational only.
        </p>
        <fieldset className="grid gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="performerMode"
              className="mt-1"
              checked={performerMode === "info_only"}
              onChange={() => setPerformerMode("info_only")}
            />
            <span>
              <span className="font-medium text-white">Publish event information only</span>
              <span className="block text-white/55">Schedule visible; no online reservations.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="performerMode"
              className="mt-1"
              checked={performerMode === "interest_waitlist"}
              onChange={() => setPerformerMode("interest_waitlist")}
            />
            <span>
              <span className="font-medium text-white">Collect performer interest or waitlist</span>
              <span className="block text-white/55">
                Keep MicStage booking off; use your existing signup notes or dashboard waitlist tools if available.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="performerMode"
              className="mt-1"
              checked={performerMode === "micstage_booking"}
              onChange={() => setPerformerMode("micstage_booking")}
            />
            <span>
              <span className="font-medium text-white">Enable MicStage online booking</span>
              <span className="block text-white/55">Creates publicly reservable slots under your booking window rules.</span>
            </span>
          </label>
        </fieldset>

        {enableBooking ? (
          <div className="mt-2 grid gap-3 border-t border-white/10 pt-3">
            <h3 className="text-sm font-semibold text-white/90">MicStage booking availability</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Booking mode</span>
              <select
                value={bookingMode}
                onChange={(e) => setBookingMode(e.target.value)}
                className="h-10 rounded-md border border-white/15 bg-black/40 px-3"
              >
                <option value="NONE">Advance / open booking window</option>
                <option value="HOURS_BEFORE">Hours before show</option>
                <option value="ON_PREMISE">On-premise only</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Advance booking days</span>
              <input
                type="number"
                min={1}
                max={180}
                value={advanceDays}
                onChange={(e) => setAdvanceDays(Number(e.target.value))}
                className="h-10 rounded-md border border-white/15 bg-black/40 px-3"
              />
            </label>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 font-semibold text-black disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save and continue"}
        </button>
        <button
          type="button"
          className="text-sm text-white/70 underline"
          onClick={() => {
            void navigator.clipboard?.writeText(
              `${window.location.origin}/open-mics/${props.listing?.slug ?? props.venue.slug}`,
            );
          }}
        >
          Copy listing URL
        </button>
      </div>
      {status === "saved" ? (
        <p className="text-sm text-emerald-300">
          Saved.
          {enableBooking
            ? " MicStage booking enabled for published templates."
            : " Online booking remains disabled."}{" "}
          Check your email for password setup if this is a new account.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <p className="text-xs text-white/40">Listing path: {listingUrl}</p>
    </form>
  );
}
