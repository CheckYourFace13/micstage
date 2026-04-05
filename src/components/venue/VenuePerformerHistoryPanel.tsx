"use client";

import Link from "next/link";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import { toggleVenuePerformerHistoryPublic } from "@/app/venue/actions";
import { VenuePerformerHistoryKind } from "@/generated/prisma/client";
import { lineupNavLabelFromYmd, toIsoDateOnly } from "@/lib/time";
import type { VenuePerformerHistoryDashboardEnrichedRow } from "@/lib/venuePerformerHistory";

function formatPerformanceDate(d: Date): string {
  return lineupNavLabelFromYmd(toIsoDateOnly(d));
}

export function VenuePerformerHistoryPanel({
  venueId,
  rows,
}: {
  venueId: string;
  rows: VenuePerformerHistoryDashboardEnrichedRow[];
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
    <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-black/25">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-[1] border-b border-white/10 bg-black/90 text-[10px] font-semibold uppercase tracking-wider text-white/50">
          <tr>
            <th className="px-3 py-2">Performer</th>
            <th className="px-3 py-2">Last Performance</th>
            <th className="px-3 py-2">Performances Here / Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top border-b border-white/5 text-white/85 last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium text-white">
                  {r.performerPublicHref ? (
                    <Link
                      href={r.performerPublicHref}
                      className="text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 hover:brightness-110"
                    >
                      {r.displayName}
                    </Link>
                  ) : (
                    <span>{r.displayName}</span>
                  )}
                </div>
                {r.kind === VenuePerformerHistoryKind.MANUAL ? (
                  <form action={async (fd) => go(await toggleVenuePerformerHistoryPublic(fd))} className="mt-1.5 inline">
                    <input type="hidden" name="venueId" value={venueId} />
                    <input type="hidden" name="historyId" value={r.id} />
                    <input type="hidden" name="nextPublic" value={r.showOnPublicProfile ? "0" : "1"} />
                    <FormSubmitButton
                      label={r.showOnPublicProfile ? "Hide from public page" : "Show on public page"}
                      pendingLabel="…"
                      className="text-[11px] font-normal text-white/45 underline decoration-white/15 underline-offset-2 hover:text-white/70"
                    />
                  </form>
                ) : (
                  <p className="mt-1 text-[10px] text-white/35">Public listing when enabled on venue page</p>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-white/70">
                {r.performanceTimeline.length === 0 ? (
                  <span className="text-white/45">—</span>
                ) : (
                  <details className="group max-w-[14rem]">
                    <summary className="cursor-pointer list-none text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 marker:content-none [&::-webkit-details-marker]:hidden hover:brightness-110">
                      {r.lastPerformanceAtThisVenue
                        ? formatPerformanceDate(r.lastPerformanceAtThisVenue)
                        : "Not booked here yet"}
                    </summary>
                    <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-black/50 p-2 text-[11px] leading-snug text-white/75">
                      {r.performanceTimeline.map((ev, i) => (
                        <li key={`${r.id}-${ev.venueId}-${toIsoDateOnly(ev.date)}-${i}`}>
                          <span className="text-white/90">{formatPerformanceDate(ev.date)}</span>
                          <span className="text-white/40"> — </span>
                          <span>{ev.venueName}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs tabular-nums text-white/80">
                <span className="text-white">{r.performancesHere}</span>
                <span className="text-white/40"> / </span>
                {r.totalPerformancesAllVenues != null ? (
                  <span className="text-white">{r.totalPerformancesAllVenues}</span>
                ) : (
                  <span className="text-white/45" title="Totals across MicStage require a linked artist account on bookings">
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-white/40">
        Counts are non-cancelled MicStage bookings. &quot;Here&quot; is this venue only. &quot;Total&quot; is all venues only when the row is
        tied to an artist account (MicStage lineup or linked account); manual names without a link show &quot;—&quot; for total.
        Open the last performance date to see the full timeline (this venue only for manual-only rows).
      </p>
    </div>
  );
}
