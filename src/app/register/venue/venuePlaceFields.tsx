"use client";

import { useState } from "react";
import { VenuePlacePicker } from "./VenuePlacePicker";

type PlaceData = {
  venueName?: string;
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string;
};

export function VenuePlaceFields() {
  const [place, setPlace] = useState<PlaceData | null>(null);

  return (
    <div className="grid gap-3">
      <VenuePlacePicker onPlace={setPlace} />

      {/* Hidden fields submitted with the form */}
      <input type="hidden" name="venueName" value={place?.venueName ?? ""} />
      <input type="hidden" name="googlePlaceId" value={place?.placeId ?? ""} />
      <input type="hidden" name="formattedAddress" value={place?.formattedAddress ?? ""} />
      <input type="hidden" name="lat" value={place ? String(place.lat) : ""} />
      <input type="hidden" name="lng" value={place ? String(place.lng) : ""} />
      <input type="hidden" name="city" value={place?.city ?? ""} />
      <input type="hidden" name="region" value={place?.region ?? ""} />
      <input type="hidden" name="country" value={place?.country ?? ""} />

      {place ? (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          <div className="font-semibold text-white">{place.venueName ?? "Selected venue"}</div>
          <div className="mt-1 text-white/70">{place.formattedAddress}</div>
          <div className="mt-2 text-xs text-white/50">
            Place ID saved: <span className="font-mono">{place.placeId}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-white/50">You must select a suggestion before submitting.</div>
      )}
    </div>
  );
}

