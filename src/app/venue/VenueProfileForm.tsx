import { FormSubmitButton } from "@/components/FormSubmitButton";
import { discoverVenueSocials, upgradeVenuePlan, updateVenueProfile } from "./actions";
import type { Venue } from "../../generated/prisma/client";

type Props = { venue: Venue };

export function VenueProfileForm({ venue }: Props) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
        Venue profile
      </div>
      <h3 className="om-heading mt-2 text-2xl tracking-wide text-white">About your venue & what you provide</h3>
      <p className="mt-2 text-sm text-white/60">
        This is what artists see on your public page—stronger profiles build trust before they book. Use direct image URLs
        (one per line). You can save now and refine anytime.{" "}
        <span className="text-white/45">
          Performance format (acoustic-only, full band, etc.) is set per schedule block in{" "}
          <span className="text-white/60">Set weekly schedule</span> or when adding a recurring night.
        </span>
      </p>

      <form action={updateVenueProfile} className="mt-6 grid gap-5">
        <input type="hidden" name="venueId" value={venue.id} />

        <label className="grid gap-1 text-sm">
          <span className="text-white/80">About the venue (public)</span>
          <textarea
            name="about"
            rows={4}
            defaultValue={venue.about ?? ""}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
            placeholder="Stage size, vibe, parking, drink minimums, signup process…"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Logo image URL</span>
            <input
              name="logoUrl"
              defaultValue={venue.logoUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://..."
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Image 1 URL</span>
            <input
              name="imagePrimaryUrl"
              defaultValue={venue.imagePrimaryUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://..."
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Image 2 URL</span>
            <input
              name="imageSecondaryUrl"
              defaultValue={venue.imageSecondaryUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://..."
            />
          </label>
        </div>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">Website + social accounts</div>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Website URL</span>
            <input
              name="websiteUrl"
              defaultValue={venue.websiteUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://yourvenue.com"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Facebook</span>
              <input
                name="facebookUrl"
                defaultValue={venue.facebookUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://facebook.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Instagram</span>
              <input
                name="instagramUrl"
                defaultValue={venue.instagramUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://instagram.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Twitter / X</span>
              <input
                name="twitterUrl"
                defaultValue={venue.twitterUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://x.com/... or twitter.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">TikTok</span>
              <input
                name="tiktokUrl"
                defaultValue={venue.tiktokUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://tiktok.com/@..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">YouTube</span>
              <input
                name="youtubeUrl"
                defaultValue={venue.youtubeUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://youtube.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">SoundCloud</span>
              <input
                name="soundcloudUrl"
                defaultValue={venue.soundcloudUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://soundcloud.com/..."
              />
            </label>
          </div>
          <p className="text-xs text-white/50">
            Save your profile after editing. Use auto-find below to pull social links from your saved website URL.
          </p>
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-white">What you provide for artists</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["providesPA", "PA / house sound"],
                ["providesSpeakersMics", "Speakers & microphones"],
                ["providesMonitors", "Stage monitors"],
                ["providesDrumKit", "Drum kit (house or shared)"],
                ["providesBassAmp", "Bass amp"],
                ["providesGuitarAmp", "Guitar amp"],
                ["providesKeyboard", "Keyboard / piano"],
                ["providesDiBox", "DI boxes"],
                ["providesLightingBasic", "Basic stage lighting"],
                ["providesBacklineShared", "Shared backline"],
              ] as const
            ).map(([name, label]) => {
              const checked =
                name === "providesPA"
                  ? venue.providesPA
                  : name === "providesSpeakersMics"
                    ? venue.providesSpeakersMics
                    : name === "providesMonitors"
                      ? venue.providesMonitors
                      : name === "providesDrumKit"
                        ? venue.providesDrumKit
                        : name === "providesBassAmp"
                          ? venue.providesBassAmp
                          : name === "providesGuitarAmp"
                            ? venue.providesGuitarAmp
                            : name === "providesKeyboard"
                              ? venue.providesKeyboard
                              : name === "providesDiBox"
                                ? venue.providesDiBox
                                : name === "providesLightingBasic"
                                  ? venue.providesLightingBasic
                                  : venue.providesBacklineShared;
              return (
                <label key={name} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={checked}
                    className="h-4 w-4 rounded border-white/30 bg-black/40 accent-[rgb(var(--om-neon))]"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <FormSubmitButton
          label="Save venue profile"
          pendingLabel="Saving profile…"
          className="h-11 rounded-md border border-white/15 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
        />
      </form>

      <form action={discoverVenueSocials} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-3">
        <input type="hidden" name="venueId" value={venue.id} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white/70">Auto-find socials from website</div>
          <p className="mt-1 text-xs text-white/45">
            Reads the website URL already saved for this venue. Save the profile first if you just changed the URL.
          </p>
        </div>
        <FormSubmitButton
          label="Run auto-find"
          pendingLabel="Searching website…"
          className="h-10 shrink-0 rounded-md border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
        />
      </form>

      {venue.subscriptionTier === "FREE" ? (
        <form action={upgradeVenuePlan} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="venueId" value={venue.id} />
          <FormSubmitButton
            label="Upgrade to PRO (unlock longer booking windows)"
            pendingLabel="Upgrading…"
            className="h-10 rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
          />
          <span className="text-xs text-white/50">Payments integration is TODO; this is dev-safe.</span>
        </form>
      ) : (
        <div className="mt-4 text-xs text-white/60">PRO enabled: your booking horizon can extend beyond 60 days.</div>
      )}
    </div>
  );
}
