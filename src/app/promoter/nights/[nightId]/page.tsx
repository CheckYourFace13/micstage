import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { assertHostOwnsNight } from "@/lib/host/hostNightAuth";
import { loadHostNightLineupContext } from "@/lib/host/hostNightLineupData";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata, absoluteUrl } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import {
  hostHouseBookSlotAction,
  hostRemoveBookingAction,
  updateHostNightSignupAction,
} from "../../night-actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Manage night",
  description: "Host lineup and signup controls for your open mic night.",
  path: "/promoter/nights",
  index: false,
});

export default async function HostNightManagePage(props: {
  params: Promise<{ nightId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { nightId } = await props.params;
  const { saved } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware.");
  }

  const prisma = requirePrisma();
  const owned = await assertHostOwnsNight(prisma, session.promoterId, nightId);
  if (!owned.ok) notFound();

  const ctx = await loadHostNightLineupContext(nightId);
  if (!ctx) notFound();

  const lineupUrl = absoluteUrl(publicLineupPathForNightId(nightId));
  const ymd = storageYmdUtc(ctx.night.date);
  const slots = ctx.instance?.slots ?? [];

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/promoter" className="text-sm text-white/70 hover:text-white">
          ← Host dashboard
        </Link>

        <h1 className="om-heading mt-4 text-2xl tracking-wide sm:text-3xl">
          {ctx.night.title?.trim() || ctx.night.series.name}
        </h1>
        <p className="mt-2 text-sm text-white/70">
          {lineupNavLabelFromYmd(ymd)} · {ctx.night.venue.name}
          {ctx.night.venue.city ? ` · ${ctx.night.venue.city}` : ""}
        </p>

        {saved ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm">Saved.</div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={publicLineupPathForNightId(nightId)}
            className="inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black"
          >
            View public lineup
          </Link>
          <SharePageButtons url={lineupUrl} label="Share signup link" />
        </div>

        <form action={updateHostNightSignupAction} className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <input type="hidden" name="nightId" value={nightId} />
          <h2 className="text-lg font-semibold">Signup settings</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="signupEnabled" defaultChecked={ctx.night.signupEnabled} />
            Enable performer signup
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-white/75">Minutes per slot</span>
            <input
              name="slotMinutes"
              type="number"
              min={3}
              max={30}
              defaultValue={ctx.night.slotMinutes}
              className="h-11 w-24 rounded-md border border-white/10 bg-black/40 px-3 text-white"
            />
          </label>
          <FormSubmitButton label="Save signup settings" className="h-11 w-fit rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold" />
        </form>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lineup ({slots.length} slots)</h2>
          <ul className="mt-3 grid gap-2">
            {slots.map((slot) => {
              const label =
                slot.booking && !slot.booking.cancelledAt
                  ? slot.booking.performerName
                  : slot.manualLineupLabel || "Open";
              return (
                <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm">
                  <span>
                    {label}{" "}
                    <span className="text-white/45">
                      {Math.floor(slot.startMin / 60)}:{String(slot.startMin % 60).padStart(2, "0")}
                    </span>
                  </span>
                  {slot.booking && !slot.booking.cancelledAt ? (
                    <form action={hostRemoveBookingAction}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <button type="submit" className="text-xs text-red-300 underline">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <form action={hostHouseBookSlotAction} className="mt-4 grid gap-2 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-2">
            <input type="hidden" name="slotId" value={slots.find((s) => !s.booking)?.id ?? ""} />
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/75">Add performer (first open slot)</span>
              <input name="performerName" required placeholder="Performer name" className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
            </label>
            <FormSubmitButton label="Add to lineup" className="h-11 rounded-md bg-white/10 px-4 text-sm font-semibold sm:col-span-2" />
          </form>
        </section>
      </main>
    </div>
  );
}
