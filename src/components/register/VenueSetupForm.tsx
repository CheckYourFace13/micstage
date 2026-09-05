"use client";

import { useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export type ClaimListingSeed = {
  slug: string;
  name: string;
  googlePlaceId: string | null;
  formattedAddress: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export function VenueSetupForm(props: {
  submitPath: string;
  claimListing?: ClaimListingSeed | null;
  growthLeadId?: string;
  error?: string | null;
}) {
  const { submitPath, claimListing, growthLeadId, error } = props;
  const canUseListingPlace =
    Boolean(claimListing?.googlePlaceId) &&
    claimListing?.lat != null &&
    claimListing?.lng != null &&
    Number.isFinite(claimListing.lat) &&
    Number.isFinite(claimListing.lng);

  const [mode, setMode] = useState<"listing" | "search">(canUseListingPlace ? "listing" : "search");
  const [place, setPlace] = useState<PlaceData | null>(null);

  return (
    <form method="post" action={submitPath} className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
      {growthLeadId ? <input type="hidden" name="growthTraceLeadId" value={growthLeadId} /> : null}
      {claimListing ? <input type="hidden" name="claimListing" value={claimListing.slug} /> : null}

      {error === "place" ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Select your venue from the suggestions list, or use the listing location if shown.
        </div>
      ) : null}
      {error === "unavailable" ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Could not connect your venue. Try again in a moment.
        </div>
      ) : null}
      {error === "taken" ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
          That Google place is already connected to another MicStage venue. Search for a different location or contact support.
        </div>
      ) : null}

      {claimListing && canUseListingPlace ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("listing")}
              className={`rounded-md px-3 py-2 ${mode === "listing" ? "bg-[rgb(var(--om-neon))] font-semibold text-black" : "border border-white/20 text-white/80"}`}
            >
              Use listing location
            </button>
            <button
              type="button"
              onClick={() => setMode("search")}
              className={`rounded-md px-3 py-2 ${mode === "search" ? "bg-[rgb(var(--om-neon))] font-semibold text-black" : "border border-white/20 text-white/80"}`}
            >
              Search a different place
            </button>
          </div>
          {mode === "listing" ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
              <div className="font-semibold text-white">{claimListing.name}</div>
              <div className="mt-1 text-white/70">{claimListing.formattedAddress}</div>
              <input type="hidden" name="venueName" value={claimListing.name} />
              <input type="hidden" name="googlePlaceId" value={claimListing.googlePlaceId ?? ""} />
              <input type="hidden" name="formattedAddress" value={claimListing.formattedAddress} />
              <input type="hidden" name="lat" value={String(claimListing.lat)} />
              <input type="hidden" name="lng" value={String(claimListing.lng)} />
              <input type="hidden" name="city" value={claimListing.city ?? ""} />
              <input type="hidden" name="region" value={claimListing.region ?? ""} />
              <input type="hidden" name="country" value={claimListing.country ?? ""} />
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "search" ? (
        <div className="grid gap-3">
          <VenuePlacePicker onPlace={setPlace} />
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
            <p className="text-xs text-white/50">Select a suggestion from the list before continuing.</p>
          )}
        </div>
      ) : null}

      <FormSubmitButton
        label="Connect venue"
        pendingLabel="Connecting…"
        className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-base font-semibold text-black hover:brightness-110 disabled:opacity-70"
      />
    </form>
  );
}
