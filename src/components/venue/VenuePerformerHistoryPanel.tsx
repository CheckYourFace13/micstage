"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import { toggleVenuePerformerHistoryPublic } from "@/app/venue/actions";
import { VenuePerformerHistoryKind } from "@/generated/prisma/client";

export type VenuePerformerHistoryRow = {
  id: string;
  kind: VenuePerformerHistoryKind;
  displayName: string;
  lastUsedAt: Date;
  useCount: number;
  showOnPublicProfile: boolean;
  musicianId: string | null;
  linkedMusicianId: string | null;
};

export function VenuePerformerHistoryPanel({
  venueId,
  rows,
}: {
  venueId: string;
  rows: VenuePerformerHistoryRow[];
}) {
  const go = useVenuePortalRedirect();
  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-white/55">
        No saved performer names yet. They appear here when you assign MicStage artists or type names on lineup slots,
        house bookings, or public reservations.
      </div>
    );
  }

  return (
    <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/25">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-white/10 bg-black/80 text-[10px] font-semibold uppercase tracking-wider text-white/50">
          <tr>
            <th className="px-3 py-2">Performer</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Uses</th>
            <th className="px-3 py-2">Public</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-white/5 text-white/85 last:border-0">
              <td className="px-3 py-2 font-medium">{r.displayName}</td>
              <td className="px-3 py-2 text-xs text-white/55">
                {r.kind === VenuePerformerHistoryKind.MUSICIAN
                  ? "MicStage account"
                  : r.linkedMusicianId
                    ? "Manual · linked account"
                    : "Manual"}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums text-white/55">{r.useCount}</td>
              <td className="px-3 py-2">
                {r.kind === VenuePerformerHistoryKind.MANUAL ? (
                  <form action={async (fd) => go(await toggleVenuePerformerHistoryPublic(fd))} className="inline">
                    <input type="hidden" name="venueId" value={venueId} />
                    <input type="hidden" name="historyId" value={r.id} />
                    <input type="hidden" name="nextPublic" value={r.showOnPublicProfile ? "0" : "1"} />
                    <FormSubmitButton
                      label={r.showOnPublicProfile ? "Hide" : "Show"}
                      pendingLabel="…"
                      className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/10"
                    />
                  </form>
                ) : (
                  <span className="text-xs text-white/40">Always</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
