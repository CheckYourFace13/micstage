"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { VenueProfileWebsiteImport } from "@/components/portal/ProfileWebsiteImportPanels";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import {
  upgradeVenuePlan,
  updateVenueProfile,
  uploadVenueLogoImage,
  uploadVenuePrimaryImage,
  uploadVenueSecondaryImage,
} from "./actions";
import type { Venue } from "../../generated/prisma/client";

type Props = { venue: Venue; emphasis?: "primary" | "secondary" };

function ActiveUrlHint({ label, url }: { label: string; url: string | null | undefined }) {
  if (!url?.trim()) {
    return <span className="text-white/40">None saved yet</span>;
  }
  return (
    <span className="text-white/55">
      Active {label}: <span className="break-all font-mono text-[10px] text-emerald-200/80">{url}</span>
    </span>
  );
}

export function VenueProfileForm({ venue, emphasis = "primary" }: Props) {
  const go = useVenuePortalRedirect();
  const secondary = emphasis === "secondary";
  return (
    <div
      className={
        secondary ? "mt-0 rounded-xl border border-white/10 bg-black/25 p-5" : "mt-6 rounded-2xl border border-white/10 bg-black/30 p-6"
      }
    >
      {!secondary ? (
        <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
          Venue profile
        </div>
      ) : null}
      <h3
        className={
          secondary
            ? "om-heading mt-0 text-lg font-semibold tracking-wide text-white"
            : "om-heading mt-2 text-2xl tracking-wide text-white"
        }
      >
        {secondary ? "Venue info & images" : "About your venue & what you provide"}
      </h3>
      <p className={secondary ? "mt-2 text-xs text-white/55" : "mt-2 text-sm text-white/60"}>
        {secondary
          ? "Public-facing details artists see alongside your lineup. Format per night is set under schedule blocks below."
          : "This is what artists see on your public page. Add a website URL, run import for suggestions, upload images or paste URLs, then save. Performance format is set per schedule block."}
      </p>

      <form
        action={async (fd) => go(await updateVenueProfile(fd))}
        encType="multipart/form-data"
        className="mt-6 grid gap-5"
      >
        <input type="hidden" name="venueId" value={venue.id} />

        <label className="grid gap-1 text-sm">
          <span className="text-white/80">About the venue (public)</span>
          <textarea
            id="venue-profile-about"
            name="about"
            rows={4}
            defaultValue={venue.about ?? ""}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
            placeholder="Stage size, vibe, parking, drink minimums, signup process…"
          />
        </label>

        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">Website & social accounts</div>
          <label className="grid gap-1 text-sm">
            <span className="text-white/80">Website URL</span>
            <input
              id="venue-profile-website"
              name="websiteUrl"
              defaultValue={venue.websiteUrl ?? ""}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://yourvenue.com"
            />
          </label>
          <VenueProfileWebsiteImport venueId={venue.id} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Facebook</span>
              <input
                id="venue-profile-facebookUrl"
                name="facebookUrl"
                defaultValue={venue.facebookUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://facebook.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Instagram</span>
              <input
                id="venue-profile-instagramUrl"
                name="instagramUrl"
                defaultValue={venue.instagramUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://instagram.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Twitter / X</span>
              <input
                id="venue-profile-twitterUrl"
                name="twitterUrl"
                defaultValue={venue.twitterUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://x.com/... or twitter.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">TikTok</span>
              <input
                id="venue-profile-tiktokUrl"
                name="tiktokUrl"
                defaultValue={venue.tiktokUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://tiktok.com/@..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">YouTube</span>
              <input
                id="venue-profile-youtubeUrl"
                name="youtubeUrl"
                defaultValue={venue.youtubeUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://youtube.com/..."
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">SoundCloud</span>
              <input
                id="venue-profile-soundcloudUrl"
                name="soundcloudUrl"
                defaultValue={venue.soundcloudUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://soundcloud.com/..."
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-semibold text-white">Logo & photos</div>
          <p className="text-xs text-white/50">
            Paste image URLs or upload files (JPEG, PNG, WebP, GIF — max ~2.5MB). Uploads save immediately to your
            profile; use Save profile below to persist URL edits and other fields together.
          </p>

          <div className="grid gap-3 border-b border-white/10 pb-4">
            <div className="text-xs text-white/70">Logo</div>
            <p className="text-[11px]">
              <ActiveUrlHint label="logo URL" url={venue.logoUrl} />
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Logo URL</span>
              <input
                id="venue-profile-logoUrl"
                name="logoUrl"
                defaultValue={venue.logoUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://..."
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                name="venueUploadLogo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="max-w-xs text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white"
              />
              <FormSubmitButton
                formAction={async (fd) => go(await uploadVenueLogoImage(fd))}
                label="Upload logo"
                pendingLabel="Uploading…"
                className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid gap-3 border-b border-white/10 pb-4">
            <div className="text-xs text-white/70">Image 1</div>
            <p className="text-[11px]">
              <ActiveUrlHint label="image 1 URL" url={venue.imagePrimaryUrl} />
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Image 1 URL</span>
              <input
                id="venue-profile-imagePrimaryUrl"
                name="imagePrimaryUrl"
                defaultValue={venue.imagePrimaryUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://..."
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                name="venueUploadPrimary"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="max-w-xs text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white"
              />
              <FormSubmitButton
                formAction={async (fd) => go(await uploadVenuePrimaryImage(fd))}
                label="Upload image 1"
                pendingLabel="Uploading…"
                className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="text-xs text-white/70">Image 2</div>
            <p className="text-[11px]">
              <ActiveUrlHint label="image 2 URL" url={venue.imageSecondaryUrl} />
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Image 2 URL</span>
              <input
                id="venue-profile-imageSecondaryUrl"
                name="imageSecondaryUrl"
                defaultValue={venue.imageSecondaryUrl ?? ""}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="https://..."
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                name="venueUploadSecondary"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="max-w-xs text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white"
              />
              <FormSubmitButton
                formAction={async (fd) => go(await uploadVenueSecondaryImage(fd))}
                label="Upload image 2"
                pendingLabel="Uploading…"
                className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
              />
            </div>
          </div>
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

      {venue.subscriptionTier === "FREE" ? (
        <form action={async (fd) => go(await upgradeVenuePlan(fd))} className="mt-4 flex flex-wrap items-center gap-3">
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
