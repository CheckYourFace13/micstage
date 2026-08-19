"use client";

import { useCallback, useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";
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
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [usePlace, setUsePlace] = useState(false);

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
        {!usePlace ? <input type="hidden" name="venueId" value={selectedVenueId} /> : null}
        {usePlace ? (
          <>
            <input type="hidden" name="googlePlaceId" value={place?.placeId ?? ""} />
            <input type="hidden" name="venueName" value={place?.venueName ?? ""} />
            <input type="hidden" name="formattedAddress" value={place?.formattedAddress ?? ""} />
            <input type="hidden" name="lat" value={place?.lat ?? ""} />
            <input type="hidden" name="lng" value={place?.lng ?? ""} />
            <input type="hidden" name="city" value={place?.city ?? ""} />
            <input type="hidden" name="region" value={place?.region ?? ""} />
            <input type="hidden" name="country" value={place?.country ?? ""} />
          </>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-white/80 sm:col-span-2">
          <input type="checkbox" checked={usePlace} onChange={(e) => setUsePlace(e.target.checked)} />
          Add location from Google (not in MicStage yet)
        </label>

        {usePlace ? (
          <div className="sm:col-span-2">
            <VenuePlacePicker label="Search location" placeholder="Venue name + city…" onPlace={setPlace} />
          </div>
        ) : (
          <>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/75">Search MicStage venues</span>
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
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeat weekly
        </label>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" name="signupEnabled" />
          Enable performer signup
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
            <input type="hidden" name="occurrences" value="8" />
          </>
        ) : (
          <label className="grid gap-1 text-sm">
            <span className="text-white/75">Date</span>
            <input name="date" type="date" required className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
          </label>
        )}

        <FormSubmitButton label="Add night" className="h-12 rounded-md bg-[rgb(var(--om-neon))] text-sm font-semibold text-black sm:col-span-2" />
      </form>

      {props.nights.length > 0 ? (
        <ul className="mt-6 grid gap-2 text-sm">
          {props.nights.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <div>
                <div className="font-medium text-white">{n.dateLabel}</div>
                <div className="text-white/60">{n.venueName}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/promoter/nights/${n.id}`} className="text-xs font-semibold text-[rgb(var(--om-neon))] underline">
                  Manage
                </a>
                {n.lineupHref ? (
                  <a href={n.lineupHref} className="text-xs text-white/70 underline">
                    Signup link
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
