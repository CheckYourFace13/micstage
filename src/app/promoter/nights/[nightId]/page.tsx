import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { slotIsOpenForAssignment } from "@/lib/bookingSlotAssign";
import { assertHostOwnsNight } from "@/lib/host/hostNightAuth";
import { loadHostNightLineupContext } from "@/lib/host/hostNightLineupData";
import { publicLineupPathForNightId } from "@/lib/host/hostNightProvisioning";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata, absoluteUrl } from "@/lib/publicSeo";
import { scheduleWindowLabel } from "@/lib/scheduleWindow";
import { computeSignupLiveStatus } from "@/lib/signupLiveStatus";
import { lineupNavLabelFromYmd, minutesToTimeInputValue, minutesToTimeLabel } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { HostNightVenueEditor } from "@/components/host/HostNightVenueEditor";
import { SignupLiveStatusPanel } from "@/components/host/SignupLiveStatusPanel";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import { changePromoterNightVenueAction } from "../../actions";
import {
  hostHouseBookSlotAction,
  hostMoveBookingAction,
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
  const { saved, error } = await props.searchParams;
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
  const firstOpenSlotId = slots.find((s) => slotIsOpenForAssignment(s.booking))?.id ?? "";

  const signupLive = computeSignupLiveStatus({
    signupEnabled: ctx.night.signupEnabled,
    hasScheduleInstance: Boolean(ctx.instance),
    isCancelled: ctx.instance?.isCancelled ?? false,
    slots,
    nightId,
  });

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
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm">
            {saved === "venue"
              ? "Moved. Your public lineup and signup link now point at the new venue."
              : saved === "moved"
                ? "Performer moved. Start times on the grid did not change."
                : saved === "swapped"
                  ? "Performers swapped. Schedule times stayed the same."
                  : "Saved. Your public lineup shows the new day and times now."}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm">
            {error === "invalid_time"
              ? "Enter a valid start and end time. Past midnight is allowed (9:00 PM to 1:00 AM), but the night has to be under 24 hours."
              : error === "invalid_timing"
                ? "Performance time must be at least 3 minutes, and “new artist starts every” must be the same or longer (no overlapping sets)."
              : error === "invalid_date"
                ? "Enter a valid date for this night."
                : error === "duplicate_date"
                  ? "You already have a night at this venue on that date."
                  : error === "venue_missing"
                    ? "Pick a venue from the list (or add one from Google) and try again."
                    : error === "move_empty"
                      ? "That slot no longer has a performer to move."
                      : error === "move_failed"
                        ? "Could not move that performer. Try again."
                        : "That slot was already taken — choose Swap if you want to exchange performers."}
          </div>
        ) : null}

        <div className="mt-6">
          <SignupLiveStatusPanel status={signupLive} />
        </div>

        <div className="mt-6 rounded-2xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--om-neon))]">
            Share signup link
          </h2>
          <p className="mt-1 text-sm text-white/65">
            Send this to performers — they land on tonight&apos;s signup page.
          </p>
          <div className="mt-3">
            <SharePageButtons url={lineupUrl} label="Signup page" />
          </div>
          <Link
            href={publicLineupPathForNightId(nightId)}
            className="mt-3 inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black"
          >
            View public lineup
          </Link>
        </div>

        <form action={updateHostNightSignupAction} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <input type="hidden" name="nightId" value={nightId} />
          <div>
            <h2 className="text-lg font-semibold">Day & times</h2>
            <p className="mt-1 text-sm text-white/60">
              Currently {lineupNavLabelFromYmd(ymd)} · {scheduleWindowLabel(ctx.night.startTimeMin, ctx.night.endTimeMin)}.
              A night that runs past midnight is fine — set 9:00 PM to 1:00 AM and it ends the next morning.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Date</span>
              <input
                name="date"
                type="date"
                defaultValue={ymd}
                className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Start time</span>
              <input
                name="startTime"
                type="time"
                required
                defaultValue={minutesToTimeInputValue(ctx.night.startTimeMin)}
                className="h-12 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-base text-white"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">End time</span>
              <input
                name="endTime"
                type="time"
                required
                defaultValue={minutesToTimeInputValue(ctx.night.endTimeMin)}
                className="h-12 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-base text-white"
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm text-white/80">
            <input type="checkbox" name="applyFutureNights" className="mt-1" />
            <span>
              Apply these times, performance length, start interval, and signup settings to{" "}
              <strong>future nights</strong> in this series too (so every Friday matches without editing each one).
            </span>
          </label>

          <h2 className="text-lg font-semibold">Signup settings</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="signupEnabled" defaultChecked={ctx.night.signupEnabled} />
            Enable performer signup
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">Performance time (minutes)</span>
              <input
                name="performanceMinutes"
                type="number"
                min={3}
                max={60}
                defaultValue={ctx.night.slotMinutes}
                required
                className="h-12 w-full rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
              />
              <span className="text-xs text-white/45">How long each artist is on stage</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/75">New artist starts every (minutes)</span>
              <input
                name="artistStartEveryMinutes"
                type="number"
                min={3}
                max={120}
                defaultValue={ctx.night.slotMinutes + ctx.night.breakMinutes}
                required
                className="h-12 w-full rounded-md border border-white/10 bg-black/40 px-3 text-base text-white"
              />
              <span className="text-xs text-white/45">
                Must be ≥ performance time. Extra minutes are changeover (not shown as a break row).
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <h2 className="text-lg font-semibold">Artist rules / performer info</h2>
            <p className="text-sm text-white/60">
              Shown to performers before they sign up. Saved for the whole series — you only type it once.
            </p>
            <textarea
              name="artistRules"
              rows={6}
              maxLength={4000}
              defaultValue={ctx.night.series.artistRules ?? ""}
              placeholder={"Examples:\n• 15-minute sets — arrive early for changeover\n• Acoustic only — bring your own instrument\n• Check in 15 minutes before your start time\n• Duos/trios count as one slot"}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
            />
          </div>

          <FormSubmitButton label="Save night" className="h-12 w-full rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold sm:w-fit" />
        </form>

        <HostNightVenueEditor
          nightId={nightId}
          currentVenueName={ctx.night.venue.name}
          currentVenuePlace={
            [ctx.night.venue.city, ctx.night.venue.region].filter(Boolean).join(", ") || null
          }
          changeVenueAction={changePromoterNightVenueAction}
        />

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lineup ({slots.length} slots)</h2>
          <p className="mt-1 text-sm text-white/55">
            Move a performer to another start time without changing the schedule grid.
          </p>
          <ul className="mt-3 grid gap-2">
            {slots.map((slot) => {
              const active = slot.booking && !slot.booking.cancelledAt ? slot.booking : null;
              const label = active ? active.performerName : slot.manualLineupLabel || "Open";
              return (
                <li
                  key={slot.id}
                  className="grid gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <span>
                    {label}{" "}
                    <span className="text-white/45">{minutesToTimeLabel(slot.startMin)}</span>
                  </span>
                  {active ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={hostMoveBookingAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="fromSlotId" value={slot.id} />
                        <input type="hidden" name="allowSwap" value="true" />
                        <label className="flex items-center gap-1 text-xs text-white/70">
                          Move to
                          <select
                            name="toSlotId"
                            required
                            defaultValue=""
                            className="h-9 rounded-md border border-white/15 bg-black/50 px-2 text-sm text-white"
                          >
                            <option value="" disabled>
                              Start time…
                            </option>
                            {slots
                              .filter((s) => s.id !== slot.id)
                              .map((s) => {
                                const otherActive = s.booking && !s.booking.cancelledAt ? s.booking : null;
                                const destLabel = otherActive
                                  ? `${minutesToTimeLabel(s.startMin)} (swap with ${otherActive.performerName})`
                                  : minutesToTimeLabel(s.startMin);
                                return (
                                  <option key={s.id} value={s.id}>
                                    {destLabel}
                                  </option>
                                );
                              })}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="h-9 rounded-md border border-white/20 px-3 text-xs font-semibold text-white"
                        >
                          Move
                        </button>
                      </form>
                      <form action={hostRemoveBookingAction}>
                        <input type="hidden" name="slotId" value={slot.id} />
                        <button type="submit" className="text-xs text-red-300 underline">
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <form action={hostHouseBookSlotAction} className="mt-4 grid gap-2 rounded-xl border border-dashed border-white/15 p-4 sm:grid-cols-2">
            <input type="hidden" name="slotId" value={firstOpenSlotId} />
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-white/75">Add performer (first open slot)</span>
              <input name="performerName" required placeholder="Performer name" className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white" />
            </label>
            <FormSubmitButton
              label="Add to lineup"
              className="h-11 rounded-md bg-white/10 px-4 text-sm font-semibold sm:col-span-2"
              disabled={!firstOpenSlotId}
            />
          </form>
        </section>
      </main>
    </div>
  );
}
