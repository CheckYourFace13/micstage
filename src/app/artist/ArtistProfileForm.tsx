import { FormSubmitButton } from "@/components/FormSubmitButton";
import { updateMusicianProfile } from "./actions";

// Prisma payload is wide; fields are validated at save time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server-only prop from artist portal query
type MusicianUser = any;

import {
  MUSICIAN_INSTRUMENTS,
  MUSICIAN_SPECIALIZATIONS,
  asStringArrayJson,
  formatVenuePickLabel,
} from "@/lib/musicianProfile";
import { PastVenuesGoogleField } from "./PastVenuesGoogleField";
import { MusicianTravelAreasField } from "./MusicianTravelAreasField";

type VenuePick = { id: string; name: string; city: string | null; region: string | null };

type VenueInterestRow = VenuePick & { isLocal: boolean };

type Props = {
  musician: MusicianUser & {
    pastVenues: {
      venueId: string;
      venue: { id: string; name: string; city: string | null; region: string | null };
    }[];
    interestedVenues: { venueId: string }[];
  };
  venuesForInterest: VenueInterestRow[];
};

export function ArtistProfileForm({ musician, venuesForInterest }: Props) {
  const specs = asStringArrayJson(musician.specializations);
  const insts = asStringArrayJson(musician.instruments);
  const interestIds = (musician.interestedVenues ?? []).map((i: { venueId: string }) => i.venueId);
  const pastVenueChips = (musician.pastVenues ?? [])
    .filter((p: { venue?: { id: string; name: string } | null }) => p.venue?.id && p.venue?.name)
    .map((p: { venue: { id: string; name: string; city: string | null; region: string | null } }) => ({
      id: p.venue.id,
      name: p.venue.name,
      city: p.venue.city,
      region: p.venue.region,
    }));

  const displayName =
    [musician.firstName, musician.lastName].filter(Boolean).join(" ").trim() || musician.stageName;

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-black/30 p-6">
      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
        Your artist profile
      </div>
      <h2 className="om-heading mt-2 text-2xl tracking-wide text-white">Profile & discovery</h2>
      <p className="mt-2 text-sm text-white/60">
        Control what appears on MicStage. Venues use this to find and evaluate you; your login email stays private. You
        can save a partial profile and come back—everything below is yours to refine over time.
      </p>

      <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/50">Visibility</div>
        <ul className="grid gap-2 text-white/75">
          <li>
            <span className="text-emerald-300/90">Public</span> — stage name, bio, image, home region/city (and second
            area), travel radii, social links, instruments/specializations, years playing, hire/rate notes, collaborations,
            past MicStage venues you list.
          </li>
          <li>
            <span className="text-amber-200/90">Private</span> — email, password, first &amp; last name (for your account
            only).
          </li>
        </ul>
        <p className="text-xs text-white/50">
          Artist search uses <span className="text-white/70">stage name only</span>, not your legal name.
        </p>
      </div>

      <form action={updateMusicianProfile} className="mt-6 grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              Stage / performance name <span className="text-emerald-300/80">(public)</span>
            </span>
            <input
              name="stageName"
              required
              defaultValue={musician.stageName}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="How you want to be listed & searched"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              Profile image URL <span className="text-emerald-300/80">(public)</span>
            </span>
            <input
              name="imageUrl"
              defaultValue={musician.imageUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://..."
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              First name <span className="text-amber-200/80">(private)</span>
            </span>
            <input
              name="firstName"
              defaultValue={musician.firstName ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              Last name <span className="text-amber-200/80">(private)</span>
            </span>
            <input
              name="lastName"
              defaultValue={musician.lastName ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="text-white/80">
            Bio <span className="text-emerald-300/80">(public)</span>
          </span>
          <textarea
            name="bio"
            rows={4}
            defaultValue={musician.bio ?? ""}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
            placeholder="Your sound, influences, what you bring to a room…"
          />
        </label>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">
            Home base & travel <span className="text-emerald-300/80">(public)</span>
          </div>
          <p className="text-xs text-white/55">
            Helps people and venues find you. Pick a city with Google (same tech as venue signup) or type city/region
            manually. Mile radii power future “gigs near you” emails and venue search — they’re stored on your profile.
          </p>
          <MusicianTravelAreasField
            initial={{
              homeGooglePlaceId: musician.homeGooglePlaceId,
              homeFormattedAddress: musician.homeFormattedAddress,
              homeLat: musician.homeLat,
              homeLng: musician.homeLng,
              homeCity: musician.homeCity,
              homeRegion: musician.homeRegion,
              travelRadiusMiles: musician.travelRadiusMiles,
              secondaryGooglePlaceId: musician.secondaryGooglePlaceId,
              secondaryFormattedAddress: musician.secondaryFormattedAddress,
              secondaryLat: musician.secondaryLat,
              secondaryLng: musician.secondaryLng,
              secondaryCity: musician.secondaryCity,
              secondaryRegion: musician.secondaryRegion,
              secondaryRadiusMiles: musician.secondaryRadiusMiles,
            }}
          />
        </div>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">Website & socials</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/80">Website</span>
              <input
                name="websiteUrl"
                defaultValue={musician.websiteUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://..."
              />
            </label>
            {(
              [
                ["facebookUrl", "Facebook", musician.facebookUrl],
                ["instagramUrl", "Instagram", musician.instagramUrl],
                ["twitterUrl", "X / Twitter", musician.twitterUrl],
                ["tiktokUrl", "TikTok", musician.tiktokUrl],
                ["youtubeUrl", "YouTube", musician.youtubeUrl],
                ["soundcloudUrl", "SoundCloud", musician.soundcloudUrl],
              ] as const
            ).map(([name, label, val]) => (
              <label key={name} className="grid gap-1 text-sm">
                <span className="text-white/80">{label}</span>
                <input
                  name={name}
                  defaultValue={val ?? ""}
                  className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                  placeholder="https://..."
                />
              </label>
            ))}
          </div>
        </div>

        <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <legend className="text-sm font-semibold text-white">What you specialize in</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MUSICIAN_SPECIALIZATIONS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
                <input
                  type="checkbox"
                  name="specialization"
                  value={o.value}
                  defaultChecked={specs.includes(o.value)}
                  className="h-4 w-4 rounded border-white/30 bg-black/40 accent-[rgb(var(--om-neon))]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <legend className="text-sm font-semibold text-white">Instruments you play</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MUSICIAN_INSTRUMENTS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
                <input
                  type="checkbox"
                  name="instrument"
                  value={o.value}
                  defaultChecked={insts.includes(o.value)}
                  className="h-4 w-4 rounded border-white/30 bg-black/40 accent-[rgb(var(--om-neon))]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              Years playing (approx.) <span className="text-emerald-300/80">(public)</span>
            </span>
            <input
              name="yearsPlaying"
              type="number"
              min={0}
              max={80}
              defaultValue={musician.yearsPlaying ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
              placeholder="e.g. 5"
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-white/80">Open to hire?</span>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-white/90">
              <input
                type="checkbox"
                name="openToHire"
                defaultChecked={musician.openToHire}
                className="h-4 w-4 rounded border-white/30 bg-black/40 accent-[rgb(var(--om-neon))]"
              />
              Yes — I’m open to paid gigs <span className="text-emerald-300/80">(public)</span>
            </label>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">
              Rate / fee <span className="text-emerald-300/80">(public)</span>
            </span>
            <input
              name="hireRateDescription"
              defaultValue={musician.hireRateDescription ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="e.g. $150 + travel"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Set length for that rate (minutes)</span>
            <input
              name="setLengthMinutes"
              type="number"
              min={5}
              max={240}
              defaultValue={musician.setLengthMinutes ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
              placeholder="e.g. 45 — how long you’d play for the fee above"
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-white/45">
          The minutes field describes how long you’d perform for the rate you listed — not a separate “typical set”
          field.
        </p>

        <label className="grid gap-1 text-sm">
          <span className="text-white/80">Bands & collaborators</span>
          <textarea
            name="collaborationsText"
            rows={3}
            defaultValue={musician.collaborationsText ?? ""}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
            placeholder="Bands you’re in, artists you’ve shared the stage with…"
          />
        </label>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">
            Past venues <span className="text-emerald-300/80">(public)</span>
          </div>
          <p className="text-xs text-white/50">
            Search with Google the same way venues register. We only link venues that already exist on MicStage (matched
            by Google Place ID).
          </p>
          <PastVenuesGoogleField initial={pastVenueChips} />
        </div>

        <div className="grid gap-3 rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.06)] p-4">
          <div className="text-sm font-semibold text-white">Open mics & venues to explore</div>
          <p className="text-xs text-white/60">
            Venues with at least one public schedule on MicStage. Local matches use your home city/region when you fill them in
            above.
          </p>
          {venuesForInterest.every((v) => !v.isLocal) ? (
            <p className="text-sm text-amber-200/90">
              Add your home city/region to see “near you” venues at the top of the list.
            </p>
          ) : null}
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            {venuesForInterest.map((v) => (
              <label
                key={v.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-white/90">
                  {v.isLocal ? (
                    <span className="mr-2 rounded bg-[rgba(var(--om-neon),0.2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--om-neon))]">
                      Near you
                    </span>
                  ) : null}
                  <span className="break-words">{formatVenuePickLabel(v)}</span>
                </span>
                <input
                  type="checkbox"
                  name="interestedVenueId"
                  value={v.id}
                  defaultChecked={interestIds.includes(v.id)}
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--om-neon))]"
                />
              </label>
            ))}
          </div>
        </div>

        <FormSubmitButton
          label="Save profile"
          pendingLabel="Saving…"
          className="h-11 rounded-md border border-white/15 bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
        />

        <p className="text-xs text-white/45">
          Signed in as <span className="font-mono">{musician.email}</span>
          {displayName !== musician.stageName ? (
            <>
              {" "}
              · <span className="text-white/70">{displayName}</span>
            </>
          ) : null}
        </p>
      </form>
    </div>
  );
}
