"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Script from "next/script";

export type PlaceData = {
  venueName?: string;
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string;
};

function getComponent(components: google.maps.GeocoderAddressComponent[], type: string) {
  return components.find((c) => c.types.includes(type))?.long_name;
}

const DEFAULT_ESTABLISHMENT_TYPES: string[] = ["establishment"];

export function VenuePlacePicker(props: {
  onPlace: (p: PlaceData) => void;
  /** Google Places Autocomplete `types`, e.g. `["establishment"]` or `["(cities)"]` */
  types?: string[];
  label?: string;
  placeholder?: string;
}) {
  const types = props.types ?? DEFAULT_ESTABLISHMENT_TYPES;
  const label = props.label ?? "Search your venue on Google";
  const placeholder = props.placeholder ?? "Start typing the venue name + city…";
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [error, setError] = useState<string | null>(() =>
    apiKey?.trim()
      ? null
      : "Address search isn’t available right now. Refresh and try again, or contact support if it keeps happening.",
  );

  const scriptSrc = useMemo(() => {
    const key = apiKey ?? "";
    // NOTE: key must be defined in .env.local for this to work.
    return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
  }, [apiKey]);

  useEffect(() => {
    if (!ready) return;
    if (!inputRef.current) return;
    if (!window.google?.maps?.places) {
      queueMicrotask(() =>
        setError("Places search didn’t load. Refresh and try again, or contact support if it keeps happening."),
      );
      return;
    }

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["place_id", "formatted_address", "name", "geometry", "address_components"],
      types,
    });

    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.place_id || !place.formatted_address || !place.geometry?.location) {
        setError("Please pick a suggestion from the dropdown.");
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const comps = place.address_components ?? [];

      const city =
        getComponent(comps, "locality") ??
        getComponent(comps, "postal_town") ??
        getComponent(comps, "administrative_area_level_2");
      const region = getComponent(comps, "administrative_area_level_1");
      const country = getComponent(comps, "country");

      props.onPlace({
        venueName: place.name ?? undefined,
        placeId: place.place_id,
        formattedAddress: place.formatted_address,
        lat,
        lng,
        city,
        region,
        country,
      });
      setError(null);
    });

    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [ready, props.onPlace, types]);

  return (
    <div className="grid gap-2">
      {apiKey?.trim() ? (
        <Script
          src={scriptSrc}
          strategy="afterInteractive"
          onLoad={() => setReady(true)}
          onError={() =>
            queueMicrotask(() =>
              setError("Maps didn’t load. Check your connection and try again, or contact support if it keeps happening."),
            )
          }
        />
      ) : null}

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">{label}</span>
        <input
          id={inputId}
          ref={inputRef}
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>

      {error ? <div className="text-xs text-[rgb(var(--om-neon))]">{error}</div> : null}
      <div className="text-xs text-white/50">
        Tip: pick the exact listing from the dropdown so we save the correct location.
      </div>
    </div>
  );
}

