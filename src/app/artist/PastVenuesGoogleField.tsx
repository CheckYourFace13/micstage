"use client";

import { useCallback, useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";
import { formatVenuePickLabel } from "@/lib/musicianProfile";
import { lookupMicStageVenueByGooglePlaceId } from "./actions";

export type PastVenueChip = { id: string; name: string; city: string | null; region: string | null };

const MAX_PAST = 12;
const ESTABLISHMENT_TYPES: string[] = ["establishment"];

export function PastVenuesGoogleField({ initial }: { initial: PastVenueChip[] }) {
  const [venues, setVenues] = useState<PastVenueChip[]>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onPlace = useCallback(async (p: PlaceData) => {
    setPending(true);
    setNotice(null);
    try {
      const v = await lookupMicStageVenueByGooglePlaceId(p.placeId);
      if (!v) {
        setNotice(
          "That place isn't on MicStage yet (venues register with the same Google listing). Ask the venue to sign up, then add it here.",
        );
        return;
      }
      setVenues((prev) => {
        if (prev.some((x) => x.id === v.id)) {
          setNotice("That venue is already in your list.");
          return prev;
        }
        if (prev.length >= MAX_PAST) {
          setNotice(`You can add up to ${MAX_PAST} past venues.`);
          return prev;
        }
        return [...prev, v];
      });
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div className="grid gap-3">
      <VenuePlacePicker
        types={ESTABLISHMENT_TYPES}
        label="Search a venue on Google (same as venue signup)"
        placeholder="Venue name + city…"
        onPlace={onPlace}
      />
      {pending ? <p className="text-xs text-white/50">Checking MicStage…</p> : null}
      {notice ? <p className="text-xs text-amber-200/90">{notice}</p> : null}

      {venues.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {venues.map((v) => (
            <li
              key={v.id}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/35 px-2 py-1 text-xs text-white/90"
            >
              <span className="min-w-0 truncate">{formatVenuePickLabel(v)}</span>
              <button
                type="button"
                className="shrink-0 rounded border border-white/20 px-1.5 text-[10px] uppercase tracking-wide text-white/70 hover:bg-white/10"
                onClick={() => {
                  setVenues((prev) => prev.filter((x) => x.id !== v.id));
                  setNotice(null);
                }}
                aria-label={`Remove ${v.name}`}
              >
                Remove
              </button>
              <input type="hidden" name="pastVenueId" value={v.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/45">No past venues added yet.</p>
      )}
    </div>
  );
}
