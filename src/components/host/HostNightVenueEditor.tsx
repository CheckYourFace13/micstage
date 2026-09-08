"use client";

import { useCallback, useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type VenueResult = {
  venueId: string;
  name: string;
  place: string | null;
};

/** Move a host night to another location. Hosts don't own venues, so this never needs venue access. */
export function HostNightVenueEditor(props: {
  nightId: string;
  currentVenueName: string;
  currentVenuePlace: string | null;
  changeVenueAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueResult[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [usePlace, setUsePlace] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/promoter/search-venues-for-night?q=${encodeURIComponent(q.trim())}`);
    const data = (await res.json()) as { ok?: boolean; results?: VenueResult[] };
    if (data.ok && data.results) setResults(data.results);
  }, []);

  const canSubmit = usePlace ? Boolean(place?.placeId) : Boolean(selectedVenueId);

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-lg font-semibold">Location</h2>
      <p className="mt-1 text-sm text-white/60">
        {props.currentVenueName}
        {props.currentVenuePlace ? ` · ${props.currentVenuePlace}` : ""}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex h-11 items-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white"
        >
          Move to another venue
        </button>
      ) : (
        <form action={props.changeVenueAction} className="mt-4 grid gap-3">
          <input type="hidden" name="nightId" value={props.nightId} />
          <input type="hidden" name="returnTo" value="night" />
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

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={usePlace} onChange={(e) => setUsePlace(e.target.checked)} />
            Add location from Google (not in MicStage yet)
          </label>

          {usePlace ? (
            <VenuePlacePicker label="Search location" placeholder="Venue name + city…" onPlace={setPlace} />
          ) : (
            <>
              <label className="grid gap-1 text-sm">
                <span className="text-white/75">Search MicStage venues</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => void search(e.target.value)}
                  placeholder="Search venue name or city"
                  className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
                />
              </label>
              <div className="grid gap-2">
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

          <label className="grid gap-1 text-sm">
            <span className="text-white/75">Apply to</span>
            <select
              name="scope"
              defaultValue="this"
              className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
            >
              <option value="this">Just this night</option>
              <option value="future">This night and future nights in this series</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <FormSubmitButton
              label="Move night"
              pendingLabel="Moving…"
              disabled={!canSubmit}
              className="h-12 rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-md border border-white/15 px-4 text-sm font-semibold text-white/80"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
