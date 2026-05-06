import Link from "next/link";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import {
  approvePromoterVenueAccessAction,
  rejectPromoterVenueAccessAction,
} from "./promoterVenueAccessActions";

export type PromoterVenueAccessPanelRow = {
  id: string;
  promoter: { email: string };
  venue: { name: string; slug: string };
};

export function PromoterVenueAccessPanel({ rows }: { rows: PromoterVenueAccessPanelRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4 sm:p-6">
      <div className="text-xs font-medium uppercase tracking-widest text-violet-200/80">Promoters</div>
      <h2 className="om-heading mt-2 text-xl tracking-wide text-white">Pending promoter access</h2>
      <p className="mt-2 text-sm text-white/70">
        Promoters organize nights across venues. Approve only people you trust to represent your room. Public lineup links stay
        on your schedule — approving access lets them plan nights in their dashboard.
      </p>
      <ul className="mt-5 grid gap-4">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm text-white/90">{row.promoter.email}</div>
              <div className="mt-1 text-xs text-white/55">
                Venue:{" "}
                <Link className="text-violet-200/90 underline hover:text-white" href={`/venues/${row.venue.slug}`}>
                  {row.venue.name}
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={approvePromoterVenueAccessAction}>
                <input type="hidden" name="accessId" value={row.id} />
                <FormSubmitButton
                  label="Approve"
                  pendingLabel="Approving…"
                  className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-60"
                />
              </form>
              <form action={rejectPromoterVenueAccessAction}>
                <input type="hidden" name="accessId" value={row.id} />
                <FormSubmitButton
                  label="Decline"
                  pendingLabel="Declining…"
                  className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-60"
                />
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
