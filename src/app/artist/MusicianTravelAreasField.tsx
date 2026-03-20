"use client";

import { useCallback, useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";

/** Stable reference so VenuePlacePicker’s effect does not re-run every render */
const CITY_TYPES: string[] = ["(cities)"];

export type MusicianGeoInitial = {
  homeGooglePlaceId: string | null;
  homeFormattedAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeCity: string | null;
  homeRegion: string | null;
  travelRadiusMiles: number | null;
  secondaryGooglePlaceId: string | null;
  secondaryFormattedAddress: string | null;
  secondaryLat: number | null;
  secondaryLng: number | null;
  secondaryCity: string | null;
  secondaryRegion: string | null;
  secondaryRadiusMiles: number | null;
};

export function MusicianTravelAreasField({ initial }: { initial: MusicianGeoInitial }) {
  const [homeG, setHomeG] = useState(initial.homeGooglePlaceId ?? "");
  const [homeFa, setHomeFa] = useState(initial.homeFormattedAddress ?? "");
  const [homeLat, setHomeLat] = useState(initial.homeLat != null ? String(initial.homeLat) : "");
  const [homeLng, setHomeLng] = useState(initial.homeLng != null ? String(initial.homeLng) : "");
  const [homeCity, setHomeCity] = useState(initial.homeCity ?? "");
  const [homeRegion, setHomeRegion] = useState(initial.homeRegion ?? "");
  const [travelR, setTravelR] = useState(
    initial.travelRadiusMiles != null ? String(initial.travelRadiusMiles) : "",
  );

  const [secG, setSecG] = useState(initial.secondaryGooglePlaceId ?? "");
  const [secFa, setSecFa] = useState(initial.secondaryFormattedAddress ?? "");
  const [secLat, setSecLat] = useState(initial.secondaryLat != null ? String(initial.secondaryLat) : "");
  const [secLng, setSecLng] = useState(initial.secondaryLng != null ? String(initial.secondaryLng) : "");
  const [secCity, setSecCity] = useState(initial.secondaryCity ?? "");
  const [secRegion, setSecRegion] = useState(initial.secondaryRegion ?? "");
  const [secR, setSecR] = useState(
    initial.secondaryRadiusMiles != null ? String(initial.secondaryRadiusMiles) : "",
  );

  const onHomePlace = useCallback((p: PlaceData) => {
    setHomeG(p.placeId);
    setHomeFa(p.formattedAddress);
    setHomeLat(String(p.lat));
    setHomeLng(String(p.lng));
    setHomeCity(p.city ?? "");
    setHomeRegion(p.region ?? "");
  }, []);

  const onSecPlace = useCallback((p: PlaceData) => {
    setSecG(p.placeId);
    setSecFa(p.formattedAddress);
    setSecLat(String(p.lat));
    setSecLng(String(p.lng));
    setSecCity(p.city ?? "");
    setSecRegion(p.region ?? "");
  }, []);

  const clearSecondary = useCallback(() => {
    setSecG("");
    setSecFa("");
    setSecLat("");
    setSecLng("");
    setSecCity("");
    setSecRegion("");
    setSecR("");
  }, []);

  return (
    <div className="grid gap-6">
      <input type="hidden" name="homeGooglePlaceId" value={homeG} />
      <input type="hidden" name="homeFormattedAddress" value={homeFa} />
      <input type="hidden" name="homeLat" value={homeLat} />
      <input type="hidden" name="homeLng" value={homeLng} />

      <div className="grid gap-3">
        <VenuePlacePicker
          types={CITY_TYPES}
          label="Home base — search your city (Google)"
          placeholder="Start typing your city…"
          onPlace={onHomePlace}
        />
        <p className="text-xs text-white/50">
          We use this so venues and MicStage can match you to gigs and open mics in your area (and for future email
          outreach by distance).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">City (editable)</span>
            <input
              name="homeCity"
              value={homeCity}
              onChange={(e) => {
                setHomeCity(e.target.value);
                setHomeG("");
                setHomeFa("");
                setHomeLat("");
                setHomeLng("");
              }}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Chicago"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">State / region (editable)</span>
            <input
              name="homeRegion"
              value={homeRegion}
              onChange={(e) => {
                setHomeRegion(e.target.value);
                setHomeG("");
                setHomeFa("");
                setHomeLat("");
                setHomeLng("");
              }}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="IL"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm sm:max-w-xs">
          <span className="text-white/80">Willing to travel from home base (miles)</span>
          <input
            name="travelRadiusMiles"
            type="number"
            min={1}
            max={500}
            value={travelR}
            onChange={(e) => setTravelR(e.target.value)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            placeholder="e.g. 35"
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Second area (optional)</div>
          <button
            type="button"
            onClick={clearSecondary}
            className="text-xs text-white/55 underline hover:text-white"
          >
            Clear second area
          </button>
        </div>
        <p className="text-xs text-white/50">
          Add another market you often play (e.g. where you grew up or visit regularly). If you use this, also set how
          far you’ll travel from <span className="text-white/70">that</span> spot.
        </p>

        <input type="hidden" name="secondaryGooglePlaceId" value={secG} />
        <input type="hidden" name="secondaryFormattedAddress" value={secFa} />
        <input type="hidden" name="secondaryLat" value={secLat} />
        <input type="hidden" name="secondaryLng" value={secLng} />

        <VenuePlacePicker
          types={CITY_TYPES}
          label="Second city / area (Google)"
          placeholder="Another city you play…"
          onPlace={onSecPlace}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">City (editable)</span>
            <input
              name="secondaryCity"
              value={secCity}
              onChange={(e) => {
                setSecCity(e.target.value);
                setSecG("");
                setSecFa("");
                setSecLat("");
                setSecLng("");
              }}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">State / region (editable)</span>
            <input
              name="secondaryRegion"
              value={secRegion}
              onChange={(e) => {
                setSecRegion(e.target.value);
                setSecG("");
                setSecFa("");
                setSecLat("");
                setSecLng("");
              }}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm sm:max-w-xs">
          <span className="text-white/80">Willing to travel from second area (miles)</span>
          <input
            name="secondaryRadiusMiles"
            type="number"
            min={1}
            max={500}
            value={secR}
            onChange={(e) => setSecR(e.target.value)}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            placeholder="Required if you use a second area"
          />
        </label>
      </div>
    </div>
  );
}
