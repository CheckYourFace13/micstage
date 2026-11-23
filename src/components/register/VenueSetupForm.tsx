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

type EntryMode = "listing" | "search" | "manual";

export function VenueSetupForm(props: {
  submitPath: string;
  /** Always post this slug when present so claim context survives even if seed/prefill is unavailable. */
  claimListingSlug?: string;
  claimListing?: ClaimListingSeed | null;
  growthLeadId?: string;
  error?: string | null;
}) {
  const { submitPath, claimListingSlug, claimListing, growthLeadId, error } = props;
  const canUseListingPlace =
    Boolean(claimListing?.googlePlaceId) &&
    claimListing?.lat != null &&
    claimListing?.lng != null &&
    Number.isFinite(claimListing.lat) &&
    Number.isFinite(claimListing.lng);

  const [mode, setMode] = useState<EntryMode>(canUseListingPlace ? "listing" : "search");
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const claimSlug = (claimListingSlug || claimListing?.slug || "").trim();

  const showManual = mode === "manual" || (mode === "search" && googleUnavailable);

  return (
    <form method="post" action={submitPath} className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
      {growthLeadId ? <input type="hidden" name="growthTraceLeadId" value={growthLeadId} /> : null}
      {claimSlug ? <input type="hidden" name="claimListing" value={claimSlug} /> : null}

      {error === "place" ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Select your venue from the suggestions list, enter it manually, or use the listing location if shown.
        </div>
      ) : null}
      {error === "manual" ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Enter venue name, street address, city, and country to continue.
        </div>
      ) : null}
      {error === "unavailable" ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
          Could not connect your venue. Try again in a moment.
        </div>
      ) : null}
      {error === "taken" ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
          That Google place is already connected to another MicStage venue. Search for a different location, enter it
          manually, or contact support.
        </div>
      ) : null}

      {claimListing && canUseListingPlace ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("listing");
                setGoogleUnavailable(false);
              }}
              className={`rounded-md px-3 py-2 ${mode === "listing" ? "bg-[rgb(var(--om-neon))] font-semibold text-black" : "border border-white/20 text-white/80"}`}
            >
              Use listing location
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("search");
                setGoogleUnavailable(false);
              }}
              className={`rounded-md px-3 py-2 ${mode === "search" && !showManual ? "bg-[rgb(var(--om-neon))] font-semibold text-black" : "border border-white/20 text-white/80"}`}
            >
              Search a different place
            </button>
            {googleUnavailable || mode === "manual" ? (
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-md px-3 py-2 ${showManual ? "bg-[rgb(var(--om-neon))] font-semibold text-black" : "border border-white/20 text-white/80"}`}
              >
                Enter manually
              </button>
            ) : null}
          </div>
          {mode === "listing" ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
              <div className="font-semibold text-white">{claimListing.name}</div>
              <div className="mt-1 text-white/70">{claimListing.formattedAddress}</div>
              <input type="hidden" name="entryMode" value="google" />
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

      {mode === "search" && !showManual ? (
        <div className="grid gap-3">
          <VenuePlacePicker
            onPlace={setPlace}
            onUnavailable={() => {
              setGoogleUnavailable(true);
              setMode("manual");
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
            <p className="text-xs text-white/50">Select a suggestion from the list before continuing, or enter manually.</p>
          )}
        </div>
      ) : null}

      {showManual ? (
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
                placeholder="City"
                autoComplete="address-level2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">State / province / region</span>
              <input
                name="region"
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="State, province, or region"
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
                placeholder="Postal or ZIP code"
                autoComplete="postal-code"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Country</span>
              <input
                name="country"
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="Country"
                autoComplete="country-name"
              />
            </label>
          </div>
          <p className="text-xs text-white/50">
            Manual entries are not marked Google-verified. You can refine the listing later from your venue dashboard.
          </p>
          {!canUseListingPlace ? (
            <button
              type="button"
              className="justify-self-start text-xs text-white/70 underline hover:text-white"
              onClick={() => {
                setGoogleUnavailable(false);
                setMode("search");
              }}
            >
              Try Google search again
            </button>
          ) : null}
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
