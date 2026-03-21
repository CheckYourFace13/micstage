import Link from "next/link";
import { requirePrisma } from "@/lib/prisma";
import { requireVenueSession, venueIdsForSession } from "@/lib/authz";
import { createEventTemplate, generateDateSchedule, houseBookSlot, inviteManager } from "./actions";
import { minutesToTimeLabel, toIsoDateOnly, weekdayToLabel } from "@/lib/time";
import { VenueProfileForm } from "./VenueProfileForm";

export const metadata = {
  title: "Venue portal | MicStage",
  alternates: {
    canonical: "https://micstage.com/venue",
  },
};

export default async function VenuePortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    profileError?: string;
    scheduleError?: string;
    planError?: string;
  }>;
}) {
  const q = await searchParams;
  const session = await requireVenueSession();
  const venueIds = await venueIdsForSession(session);
  const prisma = requirePrisma();

  const venues = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
    orderBy: { createdAt: "desc" },
    include: {
      eventTemplates: {
        orderBy: [{ weekday: "asc" }, { startTimeMin: "asc" }],
        include: {
          instances: {
            where: { date: { gte: new Date() } },
            orderBy: { date: "asc" },
            take: 2,
            include: { slots: { orderBy: { startMin: "asc" }, include: { booking: true } } },
          },
        },
      },
    },
  });

  const todayIso = toIsoDateOnly(new Date());
  const horizonDaysFor = (tier: "FREE" | "PRO") => (tier === "FREE" ? 60 : 90);
  const plusDaysIso = (days: number) => toIsoDateOnly(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-6 py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue portal</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">Venue dashboard</h1>
            <p className="mt-2 text-sm text-white/70">
              Set when you’re open, then generate bookable slots. Signed in as{" "}
              <span className="font-mono">{session.email}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/performers"
              >
                Search performers
              </Link>
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/locations"
              >
                Search open mic venues
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link className="text-sm text-white/70 hover:text-white" href="/">
              Home
            </Link>
            <Link className="text-sm text-white/70 hover:text-white" href="/logout">
              Logout
            </Link>
          </div>
        </header>

        {q.profileError === "badRange" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            End date must be on or after start date.
          </div>
        ) : null}
        {q.profileError === "badWindow" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Booking window must be within your current plan’s limit (up to 60 days for free).
          </div>
        ) : null}
        {q.scheduleError === "outsideSeries" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That date is outside your venue’s open mic date range. Update the range in Step 1 or pick another date.
          </div>
        ) : null}
        {q.profileError === "format" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Invalid performance format. Please try again.
          </div>
        ) : null}
        {q.profileError === "missingWebsite" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Add a website URL first, then use auto-find socials.
          </div>
        ) : null}
        {q.profileError === "socialFetchFailed" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Could not fetch your website for social discovery. You can still enter social links manually.
          </div>
        ) : null}
        {q.profileError === "socialFound" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Social links were discovered. Review and save to confirm.
          </div>
        ) : null}
        {q.planError === "paymentsDisabled" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Plan upgrades are currently disabled in production until payments are connected.
          </div>
        ) : null}

        {venues.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-8">
            <div className="text-sm text-white/70">
              No venues found for this account yet. Register a venue first at{" "}
              <Link className="underline" href="/register/venue">
                /register/venue
              </Link>
              .
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-8">
            {venues.map((v) => (
              <section key={v.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-widest text-white/60">Venue</div>
                    <h2 className="mt-2 text-2xl font-semibold">{v.name}</h2>
                    <div className="mt-1 text-sm text-white/70">{v.formattedAddress}</div>
                    <div className="mt-2 text-xs text-white/60">
                      Public page:{" "}
                      <Link className="underline" href={`/venues/${v.slug}`}>
                        /venues/{v.slug}
                      </Link>
                    </div>
                  </div>
                </div>

                <VenueProfileForm venue={v} />

                {/* Step 1: when the venue is available (recurring window) */}
                <div className="mt-6 rounded-2xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.06)] p-6 shadow-[0_0_0_1px_rgba(255,45,149,0.12)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                        Step 1
                      </div>
                      <h3 className="om-heading mt-2 text-2xl tracking-wide text-white">
                        Set your available times
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm text-white/70">
                        Name this open mic night, pick the day/time, and set the booking window (start today and up to 60 days out on
                        free). Create multiple templates if you run multiple nights.
                      </p>
                    </div>
                  </div>

                  <form action={createEventTemplate} className="mt-6 grid gap-3">
                      <input type="hidden" name="venueId" value={v.id} />
                      <label className="grid gap-1 text-sm">
                        <span className="text-white/80">Open mic night name</span>
                        <input
                          name="title"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="Monday Songwriter Night"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">
                            Booking window start (today onward)
                          </span>
                          <input
                            name="seriesStartDate"
                            type="date"
                            min={todayIso}
                            max={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            defaultValue={todayIso}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">
                            Booking window end (max {horizonDaysFor(v.subscriptionTier)} days out)
                          </span>
                          <input
                            name="seriesEndDate"
                            type="date"
                            min={todayIso}
                            max={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            defaultValue={plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Weekday</span>
                          <select name="weekday" className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white">
                            <option value="MON">Monday</option>
                            <option value="TUE">Tuesday</option>
                            <option value="WED">Wednesday</option>
                            <option value="THU">Thursday</option>
                            <option value="FRI">Friday</option>
                            <option value="SAT">Saturday</option>
                            <option value="SUN">Sunday</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Time zone (auto from venue location)</span>
                          <input
                            name="timeZone"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                            defaultValue={v.timeZone}
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Start time</span>
                          <input
                            name="startTime"
                            type="time"
                            required
                            defaultValue="17:00"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">End time</span>
                          <input
                            name="endTime"
                            type="time"
                            required
                            defaultValue="21:00"
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 font-mono text-white"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Slot minutes</span>
                          <input
                            name="slotMinutes"
                            type="number"
                            min={1}
                            defaultValue={25}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-white/80">Break minutes</span>
                          <input
                            name="breakMinutes"
                            type="number"
                            min={0}
                            defaultValue={5}
                            required
                            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                          />
                        </label>
                      </div>

                      <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
                        <legend className="text-sm font-semibold text-white">Booking release rules (for this time block)</legend>

                        <div className="grid gap-2">
                          {[
                            { value: "NONE", label: "Book anytime within the booking window" },
                            { value: "ATTENDEE_DAY_OF", label: "Reserved for attendees (unlock on the day)" },
                            { value: "HOURS_BEFORE", label: "Unlock up to X hours before start" },
                            { value: "ON_PREMISE", label: "On-premise only (location required) + X hours before start" },
                          ].map((o) => (
                            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-white/90">
                              <input
                                type="radio"
                                name="bookingRestrictionMode"
                                value={o.value}
                                defaultChecked={v.bookingRestrictionMode === o.value}
                                className="h-4 w-4 accent-[rgb(var(--om-neon))]"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/80">X hours before start</span>
                            <input
                              name="restrictionHoursBefore"
                              type="number"
                              min={0}
                              max={48}
                              defaultValue={v.restrictionHoursBefore ?? 6}
                              required
                              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-white/80">On-premise radius (meters)</span>
                            <input
                              name="onPremiseMaxDistanceMeters"
                              type="number"
                              min={50}
                              max={10000}
                              defaultValue={v.onPremiseMaxDistanceMeters ?? 1000}
                              required
                              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white"
                            />
                          </label>
                        </div>

                        <p className="text-xs text-white/50">
                          These rules apply to every generated slot inside this template (each template is a “time block”).
                        </p>
                      </fieldset>

                    <button className="mt-2 h-11 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110">
                      Save available times
                    </button>
                  </form>
                </div>

                {/* Step 2: generate bookable slots for a calendar date */}
                <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-5">
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs font-medium text-white/80">
                    Step 2
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">Generate slots for a date</div>
                  <p className="mt-1 text-sm text-white/60">
                    After you’ve set times above, pick a date and click Generate so performers can book on your public page.
                  </p>
                  {v.eventTemplates.length === 0 ? (
                    <div className="mt-4 text-sm text-white/60">Complete Step 1 first — no schedules yet.</div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {v.eventTemplates.map((t) => (
                        <div key={t.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="font-semibold">{t.title}</div>
                            <div className="text-xs text-white/60">
                              {weekdayToLabel(t.weekday)} · {minutesToTimeLabel(t.startTimeMin)}–{minutesToTimeLabel(t.endTimeMin)} ·{" "}
                              {t.slotMinutes}m + {t.breakMinutes}m
                            </div>
                          </div>
                          <form action={generateDateSchedule} className="mt-3 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="templateId" value={t.id} />
                            <label className="grid gap-1 text-xs">
                              <span className="text-white/60">Date</span>
                              <input
                                name="date"
                                type="date"
                                defaultValue={todayIso}
                                min={v.seriesStartDate ? toIsoDateOnly(v.seriesStartDate) : todayIso}
                                max={v.seriesEndDate ? toIsoDateOnly(v.seriesEndDate) : plusDaysIso(horizonDaysFor(v.subscriptionTier))}
                                className="h-10 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white"
                              />
                            </label>
                            <button className="h-10 rounded-md bg-[rgb(var(--om-neon))] px-3 text-sm font-semibold text-black hover:brightness-110">
                              Generate slots
                            </button>
                          </form>

                          {t.instances.length ? (
                            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                              <div className="text-sm font-semibold text-white/80">House bookings</div>
                              <div className="mt-3 grid gap-4">
                                {t.instances.map((inst) => (
                                  <div key={inst.id}>
                                    <div className="text-xs text-white/60">For {inst.date.toISOString().slice(0, 10)}</div>
                                    <div className="mt-2 grid gap-2">
                                      {inst.slots.map((s) => {
                                        const activeBooking = s.booking && !s.booking.cancelledAt ? s.booking : null;
                                        return (
                                          <div
                                            key={s.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                                          >
                                            <div className="text-sm">
                                              <span className="font-semibold">
                                                {minutesToTimeLabel(s.startMin)}–{minutesToTimeLabel(s.endMin)}
                                              </span>
                                              <span className="ml-2 text-white/70">
                                                {activeBooking ? `Booked: ${activeBooking.performerName}` : "Open slot"}
                                              </span>
                                            </div>
                                            {activeBooking ? null : (
                                              <form action={houseBookSlot} className="flex items-center gap-2">
                                                <input type="hidden" name="venueId" value={v.id} />
                                                <input type="hidden" name="slotId" value={s.id} />
                                                <input
                                                  name="performerName"
                                                  required
                                                  placeholder="Performer name"
                                                  className="h-9 w-40 rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white placeholder:text-white/40"
                                                />
                                                <button className="h-9 rounded-md bg-[rgb(var(--om-neon))] px-3 text-sm font-semibold text-black hover:brightness-110">
                                                  House book
                                                </button>
                                              </form>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {session.venueOwnerId ? (
                  <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-black/30 p-5">
                    <div>
                      <div className="text-sm font-semibold">Invite a manager (optional)</div>
                      <div className="mt-1 text-xs text-white/60">
                        Managers can help maintain schedules. For now, set a temp password they use to log in at Venue login.
                      </div>
                    </div>
                    <form action={inviteManager} className="grid gap-3 md:grid-cols-3">
                      <input type="hidden" name="venueId" value={v.id} />
                      <label className="grid gap-1 text-sm md:col-span-2">
                        <span className="text-white/80">Manager email</span>
                        <input
                          name="managerEmail"
                          type="email"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="manager@venue.com"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-white/80">Temp password</span>
                        <input
                          name="tempPassword"
                          required
                          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                          placeholder="Temp password"
                        />
                      </label>
                      <button className="h-11 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 md:col-span-3">
                        Add manager
                      </button>
                    </form>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

