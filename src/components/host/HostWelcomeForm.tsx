"use client";

import { useState } from "react";
import { VenuePlacePicker, type PlaceData } from "@/app/register/venue/VenuePlacePicker";

export function HostWelcomeForm(props: {
  setupAction: (formData: FormData) => void | Promise<void>;
}) {
  const [place, setPlace] = useState<PlaceData | null>(null);

  return (
    <form action={props.setupAction} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold">What do you host?</h2>
      <label className="grid gap-1 text-sm">
        <span className="text-white/75">Open mic name</span>
        <input
          name="name"
          required
          placeholder="Tuesday Comedy, Songwriter Night…"
          className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
        />
      </label>

      <h2 className="text-lg font-semibold pt-2">Where is the next one?</h2>
      <VenuePlacePicker label="Search venue or location" placeholder="Venue name + city…" onPlace={setPlace} />
      <input type="hidden" name="googlePlaceId" value={place?.placeId ?? ""} />
      <input type="hidden" name="venueName" value={place?.venueName ?? ""} />
      <input type="hidden" name="formattedAddress" value={place?.formattedAddress ?? ""} />
      <input type="hidden" name="lat" value={place?.lat ?? ""} />
      <input type="hidden" name="lng" value={place?.lng ?? ""} />
      <input type="hidden" name="city" value={place?.city ?? ""} />
      <input type="hidden" name="region" value={place?.region ?? ""} />
      <input type="hidden" name="country" value={place?.country ?? ""} />

      <h2 className="text-lg font-semibold pt-2">When?</h2>
      <label className="grid gap-1 text-sm">
        <span className="text-white/75">Date</span>
        <input name="date" type="date" required className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
      </label>

      <label className="flex items-center gap-2 text-sm text-white/85">
        <input type="checkbox" name="signupEnabled" />
        Turn on performer signup
      </label>

      <button
        type="submit"
        className="mt-2 inline-flex h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black hover:brightness-110"
      >
        Save & go to dashboard
      </button>
    </form>
  );
}
