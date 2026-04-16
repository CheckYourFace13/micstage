"use client";

import { useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { EligibleMusicianRow } from "@/lib/messaging/eligibility";
import { lineupPrimaryActionClass } from "@/components/venue/lineupActionStyles";

type VenueRow = { id: string; name: string };

export function VenueNewMessageForm(props: {
  venueRows: VenueRow[];
  musiciansByVenue: Record<string, EligibleMusicianRow[]>;
  initialVenueId: string;
  actionPath: string;
}) {
  const { venueRows, musiciansByVenue, initialVenueId, actionPath } = props;
  const [venueId, setVenueId] = useState(initialVenueId);

  const musicians = useMemo(() => musiciansByVenue[venueId] ?? [], [musiciansByVenue, venueId]);

  return (
    <form method="post" action={actionPath} className="mt-6 grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Your venue</span>
        <select
          name="venueId"
          required
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          className="h-11 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        >
          {venueRows.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Artist</span>
        <select
          name="musicianId"
          required
          className="h-11 rounded-md border border-white/15 bg-black/40 px-3 text-white"
        >
          <option value="">Select…</option>
          {musicians.map((m) => (
            <option key={m.id} value={m.id}>
              {m.stageName}
            </option>
          ))}
        </select>
      </label>
      {musicians.length === 0 ? (
        <p className="text-sm text-white/55">No eligible artists for this venue yet.</p>
      ) : null}
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Message</span>
        <textarea
          name="body"
          required
          rows={5}
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
          placeholder="Your note to the artist…"
        />
      </label>
      <FormSubmitButton
        label="Send message"
        pendingLabel="Sending…"
        className={lineupPrimaryActionClass}
        disabled={musicians.length === 0}
      />
    </form>
  );
}
