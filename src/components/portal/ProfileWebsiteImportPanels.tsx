"use client";

import { useState } from "react";
import type { WebsiteProfileHintsResult, WebsiteSocialHints } from "@/lib/websiteProfileHints";

function getInput(id: string): HTMLInputElement | HTMLTextAreaElement | null {
  return document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
}

function fillIfEmpty(id: string, value: string) {
  const el = getInput(id);
  if (!el || !value.trim()) return;
  if (el.value.trim() !== "") return;
  el.value = value;
}

function setValue(id: string, value: string) {
  const el = getInput(id);
  if (!el) return;
  el.value = value;
}

const VENUE_SOCIAL_IDS: { key: keyof WebsiteSocialHints; id: string }[] = [
  { key: "facebookUrl", id: "venue-profile-facebookUrl" },
  { key: "instagramUrl", id: "venue-profile-instagramUrl" },
  { key: "twitterUrl", id: "venue-profile-twitterUrl" },
  { key: "tiktokUrl", id: "venue-profile-tiktokUrl" },
  { key: "youtubeUrl", id: "venue-profile-youtubeUrl" },
  { key: "soundcloudUrl", id: "venue-profile-soundcloudUrl" },
];

const ARTIST_SOCIAL_IDS: { key: keyof WebsiteSocialHints; id: string }[] = [
  { key: "facebookUrl", id: "artist-profile-facebookUrl" },
  { key: "instagramUrl", id: "artist-profile-instagramUrl" },
  { key: "twitterUrl", id: "artist-profile-twitterUrl" },
  { key: "tiktokUrl", id: "artist-profile-tiktokUrl" },
  { key: "youtubeUrl", id: "artist-profile-youtubeUrl" },
  { key: "soundcloudUrl", id: "artist-profile-soundcloudUrl" },
];

function ImagePickGrid({
  urls,
  onPick,
  label,
}: {
  urls: string[];
  onPick: (u: string) => void;
  label: string;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {urls.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onPick(u)}
            className="overflow-hidden rounded-md border border-white/15 bg-black/40 transition hover:border-[rgb(var(--om-neon))]/50"
            title="Use this image URL"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-16 w-16 object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

function HintsPanel<S extends string>({
  variant,
  hints,
  onlyEmpty,
  assignSlot,
  setAssignSlot,
  imageSlotIds,
  onApplyText,
}: {
  variant: "venue" | "artist";
  hints: WebsiteProfileHintsResult;
  onlyEmpty: boolean;
  assignSlot: S;
  setAssignSlot: (slot: S) => void;
  imageSlotIds: Record<S, string>;
  onApplyText: () => void;
}) {
  const assignImage = (url: string) => {
    const id = imageSlotIds[assignSlot];
    if (id) setValue(id, url);
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/75">
      <p className="text-white/60">
        From <span className="font-mono text-[10px] text-white/80">{hints.sourceUrl}</span>
      </p>
      {hints.suggestedSiteName ? (
        <p className="mt-2">
          <span className="text-white/50">Detected title / name:</span> {hints.suggestedSiteName}
        </p>
      ) : null}
      {hints.suggestedDescription ? (
        <p className="mt-1 line-clamp-3">
          <span className="text-white/50">Description snippet:</span> {hints.suggestedDescription}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onApplyText}
        className="mt-3 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
      >
        {onlyEmpty ? "Fill empty text & social fields" : "Overwrite text & social fields from import"}
      </button>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="text-[11px] font-medium text-white/55">Assign image URL to slot (click a thumbnail)</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(variant === "venue"
            ? [
                ["logo", "Logo"] as const,
                ["primary", "Image 1"] as const,
                ["secondary", "Image 2"] as const,
              ]
            : [
                ["profile", "Profile photo"] as const,
                ["secondaryArtist", "Extra photo"] as const,
              ]
          ).map(([key, lab]) => (
            <label key={key} className="flex cursor-pointer items-center gap-1.5 text-white/85">
              <input
                type="radio"
                name={`import-assign-slot-${variant}`}
                checked={assignSlot === key}
                onChange={() => setAssignSlot(key as S)}
                className="accent-[rgb(var(--om-neon))]"
              />
              {lab}
            </label>
          ))}
        </div>
        <ImagePickGrid urls={hints.logoCandidates} onPick={assignImage} label="Logo-style candidates" />
        <ImagePickGrid urls={hints.imageCandidates} onPick={assignImage} label="All image candidates" />
      </div>
    </div>
  );
}

export function VenueProfileWebsiteImport({ venueId }: { venueId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hints, setHints] = useState<WebsiteProfileHintsResult | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [assignSlot, setAssignSlot] = useState<"logo" | "primary" | "secondary">("logo");

  const imageSlotIds = {
    logo: "venue-profile-logoUrl",
    primary: "venue-profile-imagePrimaryUrl",
    secondary: "venue-profile-imageSecondaryUrl",
  } as const satisfies Record<"logo" | "primary" | "secondary", string>;

  async function run() {
    setErr(null);
    setHints(null);
    const websiteEl = getInput("venue-profile-website");
    const url = websiteEl?.value?.trim() ?? "";
    setLoading(true);
    try {
      const res = await fetch("/api/portal/venue-website-hints", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, websiteUrl: url || undefined }),
      });
      const data = (await res.json()) as WebsiteProfileHintsResult & { error?: string };
      if (!res.ok) {
        setErr(
          data.error === "need_url"
            ? "Enter a website URL above first."
            : data.error === "fetch_failed"
              ? "Could not read that site. Try again or paste fields manually."
              : "Import failed. Check the URL and try again.",
        );
        return;
      }
      setHints(data as WebsiteProfileHintsResult);
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyText() {
    if (!hints) return;
    if (onlyEmpty) {
      if (hints.suggestedDescription) fillIfEmpty("venue-profile-about", hints.suggestedDescription);
      for (const { key, id } of VENUE_SOCIAL_IDS) {
        const v = hints.socials[key];
        if (v) fillIfEmpty(id, v);
      }
    } else {
      if (hints.suggestedDescription) setValue("venue-profile-about", hints.suggestedDescription);
      for (const { key, id } of VENUE_SOCIAL_IDS) {
        const v = hints.socials[key];
        if (v) setValue(id, v);
      }
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md border border-[rgb(var(--om-neon))]/40 bg-[rgb(var(--om-neon))]/15 px-3 py-2 text-xs font-semibold text-[rgb(var(--om-neon))] hover:bg-[rgb(var(--om-neon))]/25 disabled:opacity-50"
        >
          {loading ? "Reading site…" : "Import from website"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
            className="accent-[rgb(var(--om-neon))]"
          />
          Only fill empty fields (recommended)
        </label>
      </div>
      <p className="mt-1 text-[11px] text-white/45">
        Fetches your public page and suggests about text, social links, and images. Review everything before saving the
        profile.
      </p>
      {err ? <p className="mt-2 text-xs text-amber-200/90">{err}</p> : null}
      {hints ? (
        <HintsPanel<"logo" | "primary" | "secondary">
          variant="venue"
          hints={hints}
          onlyEmpty={onlyEmpty}
          assignSlot={assignSlot}
          setAssignSlot={setAssignSlot}
          imageSlotIds={imageSlotIds}
          onApplyText={applyText}
        />
      ) : null}
    </div>
  );
}

export function ArtistProfileWebsiteImport() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hints, setHints] = useState<WebsiteProfileHintsResult | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [assignSlot, setAssignSlot] = useState<"profile" | "secondaryArtist">("profile");

  const imageSlotIds = {
    profile: "artist-profile-imageUrl",
    secondaryArtist: "artist-profile-imageSecondaryUrl",
  } as const satisfies Record<"profile" | "secondaryArtist", string>;

  async function run() {
    setErr(null);
    setHints(null);
    const websiteEl = getInput("artist-profile-websiteUrl");
    const url = websiteEl?.value?.trim() ?? "";
    if (!url) {
      setErr("Enter your website URL first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/artist-website-hints", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });
      const data = (await res.json()) as WebsiteProfileHintsResult & { error?: string };
      if (!res.ok) {
        setErr(
          data.error === "fetch_failed"
            ? "Could not read that site. Try again or paste fields manually."
            : "Import failed. Check the URL and try again.",
        );
        return;
      }
      setHints(data as WebsiteProfileHintsResult);
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyText() {
    if (!hints) return;
    if (onlyEmpty) {
      if (hints.suggestedSiteName) fillIfEmpty("artist-profile-stageName", hints.suggestedSiteName);
      if (hints.suggestedDescription) fillIfEmpty("artist-profile-bio", hints.suggestedDescription);
      for (const { key, id } of ARTIST_SOCIAL_IDS) {
        const v = hints.socials[key];
        if (v) fillIfEmpty(id, v);
      }
    } else {
      if (hints.suggestedSiteName) setValue("artist-profile-stageName", hints.suggestedSiteName);
      if (hints.suggestedDescription) setValue("artist-profile-bio", hints.suggestedDescription);
      for (const { key, id } of ARTIST_SOCIAL_IDS) {
        const v = hints.socials[key];
        if (v) setValue(id, v);
      }
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md border border-[rgb(var(--om-neon))]/40 bg-[rgb(var(--om-neon))]/15 px-3 py-2 text-xs font-semibold text-[rgb(var(--om-neon))] hover:bg-[rgb(var(--om-neon))]/25 disabled:opacity-50"
        >
          {loading ? "Reading site…" : "Import from website"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
            className="accent-[rgb(var(--om-neon))]"
          />
          Only fill empty fields (recommended)
        </label>
      </div>
      <p className="mt-1 text-[11px] text-white/45">
        Pulls a public bio, social links, and image ideas from your site. Stage name and bio stay editable—review before
        saving.
      </p>
      {err ? <p className="mt-2 text-xs text-amber-200/90">{err}</p> : null}
      {hints ? (
        <HintsPanel<"profile" | "secondaryArtist">
          variant="artist"
          hints={hints}
          onlyEmpty={onlyEmpty}
          assignSlot={assignSlot}
          setAssignSlot={setAssignSlot}
          imageSlotIds={imageSlotIds}
          onApplyText={applyText}
        />
      ) : null}
    </div>
  );
}
