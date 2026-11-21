"use client";

import { useState } from "react";
import { VenuePlacePicker, type PlaceData } from "./VenuePlacePicker";

export function VenuePlaceFields() {
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [manual, setManual] = useState(false);

  if (manual) {
    return (
      <div className="grid gap-3">
        <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Venue search is unavailable right now. Enter your venue manually.
        </p>
        <input type="hidden" name="entryMode" value="manual" />
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Venue name</span>
          <input
            name="venueName"
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            placeholder="Your venue or room name"
            autoComplete="organization"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Street address</span>
          <input
            name="street"
            required
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            placeholder="Street number and name"
            autoComplete="street-address"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">City</span>
            <input
              name="city"
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              autoComplete="address-level2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">State / province / region</span>
            <input
              name="region"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              autoComplete="address-level1"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Postal / ZIP code</span>
            <input
              name="postal"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              autoComplete="postal-code"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Country</span>
            <input
              name="country"
              required
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              autoComplete="country-name"
            />
          </label>
        </div>
        <p className="text-xs text-white/50">Manual entries are not marked Google-verified.</p>
        <button
          type="button"
          className="justify-self-start text-xs text-white/70 underline hover:text-white"
          onClick={() => setManual(false)}
        >
          Try Google search again
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <VenuePlacePicker
        onPlace={setPlace}
        onUnavailable={() => {
          setManual(true);
          setPlace(null);
        }}
      />

      <input type="hidden" name="entryMode" value="google" />
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
        </div>
      ) : (
        <div className="text-xs text-white/50">Select a suggestion, or enter your venue manually if search fails.</div>
      )}
    </div>
  );
}
