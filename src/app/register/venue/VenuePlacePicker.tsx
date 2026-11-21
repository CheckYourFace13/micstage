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

type AddressComponentLike = {
  longText?: string | null;
  shortText?: string | null;
  types?: string[];
};

function componentLong(components: AddressComponentLike[] | undefined, type: string) {
  return components?.find((c) => c.types?.includes(type))?.longText ?? undefined;
}

const DEFAULT_ESTABLISHMENT_TYPES: string[] = ["establishment"];

const MANUAL_UNAVAILABLE_MSG = "Venue search is unavailable right now. Enter your venue manually.";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export function VenuePlacePicker(props: {
  onPlace: (p: PlaceData) => void;
  /** Google Places Autocomplete `types` (legacy names mapped to Places API New where possible). */
  types?: string[];
  label?: string;
  placeholder?: string;
  /** Fired when Google Autocomplete cannot be used — parent should offer manual entry. */
  onUnavailable?: (message: string) => void;
}) {
  const { onPlace, types: propTypes, label: propLabel, placeholder: propPlaceholder, onUnavailable } = props;
  const types = propTypes ?? DEFAULT_ESTABLISHMENT_TYPES;
  const label = propLabel ?? "Search your venue on Google";
  const placeholder = propPlaceholder ?? "Start typing the venue name + city...";
  const inputId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const unavailableNotified = useRef(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [error, setError] = useState<string | null>(() =>
    apiKey?.trim() ? null : MANUAL_UNAVAILABLE_MSG,
  );

  const scriptSrc = useMemo(() => {
    const key = apiKey ?? "";
    // Places API (New) PlaceAutocompleteElement — do not use legacy Autocomplete widget.
    return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`;
  }, [apiKey]);

  const markUnavailable = (message: string) => {
    setUnavailable(true);
    setError(message);
    if (!unavailableNotified.current) {
      unavailableNotified.current = true;
      onUnavailable?.(message);
    }
  };

  useEffect(() => {
    if (!apiKey?.trim()) {
      queueMicrotask(() => markUnavailable(MANUAL_UNAVAILABLE_MSG));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot missing-key path
  }, [apiKey]);

  useEffect(() => {
    if (!ready || unavailable) return;
    if (!hostRef.current) return;
    if (!window.google?.maps) {
      markUnavailable(MANUAL_UNAVAILABLE_MSG);
      return;
    }

    let cancelled = false;
    let widget: HTMLElement | null = null;
    const host = hostRef.current;
    const prevAuthFailure = window.gm_authFailure;

    window.gm_authFailure = () => {
      try {
        prevAuthFailure?.();
      } catch {
        // ignore
      }
      markUnavailable(MANUAL_UNAVAILABLE_MSG);
    };

    const watchErr = window.setInterval(() => {
      const errInput = host.querySelector(".gm-err-autocomplete");
      if (errInput) {
        markUnavailable(MANUAL_UNAVAILABLE_MSG);
      }
    }, 500);

    (async () => {
      try {
        // PlaceAutocompleteElement is Places API (New). Avoid legacy Autocomplete widget.
        await google.maps.importLibrary("places");
        if (cancelled) return;

        const PlaceAutocompleteElementCtor = (
          google.maps.places as unknown as {
            PlaceAutocompleteElement?: new (opts?: Record<string, unknown>) => HTMLElement;
          }
        ).PlaceAutocompleteElement;
        if (!PlaceAutocompleteElementCtor) {
          markUnavailable(MANUAL_UNAVAILABLE_MSG);
          return;
        }

        const includedPrimaryTypes = types.includes("(cities)")
          ? ["locality", "administrative_area_level_1", "administrative_area_level_3"]
          : types.includes("establishment")
            ? ["establishment"]
            : undefined;

        const el = new PlaceAutocompleteElementCtor({
          ...(includedPrimaryTypes ? { includedPrimaryTypes } : {}),
          placeholder,
        });
        el.setAttribute("id", inputId);
        el.style.display = "block";
        el.style.width = "100%";
        el.classList.add("micstage-place-autocomplete");

        el.addEventListener("gmp-error", () => {
          markUnavailable(MANUAL_UNAVAILABLE_MSG);
        });

        el.addEventListener("gmp-select", (event: Event) => {
          void (async () => {
            try {
              const ev = event as Event & {
                placePrediction?: {
                  toPlace: () => {
                    id?: string | null;
                    displayName?: string | { text?: string } | null;
                    formattedAddress?: string | null;
                    location?: { lat: () => number; lng: () => number } | null;
                    addressComponents?: AddressComponentLike[];
                    fetchFields: (req: { fields: string[] }) => Promise<unknown>;
                  };
                };
              };
              const place = ev.placePrediction?.toPlace?.();
              if (!place) {
                setError("Please pick a suggestion from the dropdown.");
                return;
              }
              await place.fetchFields({
                fields: ["id", "displayName", "formattedAddress", "location", "addressComponents"],
              });
              const placeId = place.id;
              const formattedAddress = place.formattedAddress;
              const location = place.location;
              if (!placeId || !formattedAddress || !location) {
                setError("Please pick a suggestion from the dropdown.");
                return;
              }
              const comps = place.addressComponents ?? [];
              const city =
                componentLong(comps, "locality") ??
                componentLong(comps, "postal_town") ??
                componentLong(comps, "administrative_area_level_2");
              const region = componentLong(comps, "administrative_area_level_1");
              const country = componentLong(comps, "country");
              const displayName =
                typeof place.displayName === "string"
                  ? place.displayName
                  : place.displayName?.text;

              onPlace({
                venueName: displayName || undefined,
                placeId,
                formattedAddress,
                lat: location.lat(),
                lng: location.lng(),
                city,
                region,
                country,
              });
              setError(null);
            } catch {
              markUnavailable(MANUAL_UNAVAILABLE_MSG);
            }
          })();
        });

        host.replaceChildren(el);
        widget = el;
      } catch {
        if (!cancelled) markUnavailable(MANUAL_UNAVAILABLE_MSG);
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(watchErr);
      window.gm_authFailure = prevAuthFailure;
      if (widget && widget.parentElement === host) {
        host.removeChild(widget);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount when Maps script ready
  }, [ready, unavailable, types, placeholder, inputId, onPlace]);

  if (unavailable || !apiKey?.trim()) {
    return (
      <div className="grid gap-2">
        <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
          {error || MANUAL_UNAVAILABLE_MSG}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {apiKey?.trim() ? (
        <Script
          src={scriptSrc}
          strategy="afterInteractive"
          onLoad={() => setReady(true)}
          onError={() => queueMicrotask(() => markUnavailable(MANUAL_UNAVAILABLE_MSG))}
        />
      ) : null}

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">{label}</span>
        <div
          ref={hostRef}
          className="min-h-11 rounded-md border border-white/10 bg-black/40 px-1 py-1 text-white [&_input]:h-9 [&_input]:w-full [&_input]:bg-transparent [&_input]:px-2 [&_input]:text-white [&_input]:outline-none"
        />
      </label>

      {error ? <div className="text-xs text-[rgb(var(--om-neon))]">{error}</div> : null}
      <div className="text-xs text-white/50">
        Tip: pick the exact listing from the dropdown so we save the correct location.
      </div>
      <button
        type="button"
        className="justify-self-start text-xs text-white/70 underline hover:text-white"
        onClick={() => markUnavailable(MANUAL_UNAVAILABLE_MSG)}
      >
        Enter your venue manually instead
      </button>
    </div>
  );
}
