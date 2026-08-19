"use client";

import { useCallback, useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type VenueResult = {
  venueId: string;
  name: string;
  place: string | null;
};

export function HostAddNightForm(props: {
  seriesId: string;
  seriesName: string;
  recentVenues: VenueResult[];
  addNightAction: (formData: FormData) => void | Promise<void>;
  addRecurringAction: (formData: FormData) => void | Promise<void>;
  changeVenueAction: (formData: FormData) => void | Promise<void>;
  nights: Array<{
    id: string;
    dateLabel: string;
    venueId: string;
    venueName: string;
    title: string | null;
    lineupHref: string | null;
  }>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueResult[]>(props.recentVenues);
  const [selectedVenueId, setSelectedVenueId] = useState(props.recentVenues[0]?.venueId ?? "");
  const [recurring, setRecurring] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults(props.recentVenues);
      return;
    }
    const res = await fetch(`/api/promoter/search-venues-for-night?q=${encodeURIComponent(q.trim())}`);
    const data = (await res.json()) as { ok?: boolean; results?: VenueResult[] };
    if (data.ok && data.results) setResults(data.results);
  }, [props.recentVenues]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-white">{props.seriesName}</h2>
      <p className="mt-1 text-sm text-white/60">Add nights at any venue — you don&apos;t need to own the room.</p>

      <form action={recurring ? props.addRecurringAction : props.addNightAction} className="mt-6 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <input type="hidden" name="seriesId" value={props.seriesId} />
        <input type="hidden" name="venueId" value={selectedVenueId} />

        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-white/75">Venue</span>
          <input
            type="search"
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder="Search venue name or city"
            className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
          />
        </label>
        <div className="grid gap-2 sm:col-span-2">
          {results.slice(0, 8).map((v) => (
            <button
              key={v.venueId}
              type="button"
              onClick={() => setSelectedVenueId(v.venueId)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                selectedVenueId === v.venueId
                  ? "border-violet-400/50 bg-violet-500/20 text-white"
                  : "border-white/10 bg-black/30 text-white/85 hover:bg-white/5"
              }`}
            >
              <div className="font-semibold">{v.name}</div>
              {v.place ? <div className="text-xs text-white/55">{v.place}</div> : null}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeat weekly
        </label>

        {recurring ? (
          <>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Start date</span>
              <input name="startDate" type="date" required className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Weekday</span>
              <select name="weekday" required className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <input type="hidden" name="frequency" value="weekly" />
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Occurrences</span>
              <input name="occurrences" type="number" min={1} max={26} defaultValue={8} className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
            </label>
          </>
        ) : (
          <label className="grid gap-1 text-sm">
            <span className="text-white/75">Date</span>
            <input name="date" type="date" required className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
          </label>
        )}

        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-white/75">Title (optional)</span>
          <input name="title" className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40" placeholder="Theme, guest host, etc." />
        </label>

        <div className="sm:col-span-2">
          <FormSubmitButton
            label={recurring ? "Add recurring nights" : "Add night"}
            pendingLabel="Saving…"
            className="inline-flex h-12 min-w-[140px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
          />
        </div>
      </form>

      {props.nights.length > 0 ? (
        <ul className="mt-6 grid gap-3 text-sm">
          {props.nights.map((n) => (
            <li key={n.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold text-white">{n.dateLabel}</div>
                  <div className="text-white/75">{n.venueName}</div>
                  {n.title ? <div className="text-xs text-white/55">{n.title}</div> : null}
                  <div className="mt-1 text-xs text-white/45">Hosted by you · at {n.venueName}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {n.lineupHref ? (
                    <a href={n.lineupHref} className="text-sm font-semibold text-[rgb(var(--om-neon))] underline">
                      Manage lineup
                    </a>
                  ) : null}
                </div>
              </div>
              <form action={props.changeVenueAction} className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-end">
                <input type="hidden" name="nightId" value={n.id} />
                <label className="grid flex-1 gap-1 text-xs">
                  <span className="text-white/60">Change venue</span>
                  <select name="newVenueId" defaultValue={n.venueId} className="h-10 rounded-md border border-white/10 bg-black/40 px-2 text-white">
                    {[...props.recentVenues, ...results].filter((v, i, arr) => arr.findIndex((x) => x.venueId === v.venueId) === i).map((v) => (
                      <option key={v.venueId} value={v.venueId}>{v.name}</option>
                    ))}
                  </select>
                </label>
                <select name="scope" className="h-10 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white">
                  <option value="this">This night only</option>
                  <option value="future">This and future nights</option>
                </select>
                <FormSubmitButton label="Update venue" pendingLabel="…" className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white" />
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-white/60">No upcoming nights yet. Add your first night above.</p>
      )}
    </section>
  );
}
