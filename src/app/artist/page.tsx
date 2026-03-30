import Link from "next/link";
import { requirePrisma } from "@/lib/prisma";
import { requireMusicianSession } from "@/lib/authz";
import { minutesToTimeLabel } from "@/lib/time";
import { ArtistProfileForm } from "./ArtistProfileForm";

export const metadata = {
  title: "Artist portal | MicStage",
};

export default async function ArtistPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; profileError?: string }>;
}) {
  const q = await searchParams;
  const session = await requireMusicianSession();
  const prisma = requirePrisma();

  const musician = await prisma.musicianUser.findUnique({
    where: { id: session.musicianId },
    include: {
      // Use relation shorthand (not nested select) — avoids Prisma validation issues
      // when the generated client / dev cache is briefly out of sync with the schema.
      pastVenues: {
        include: {
          venue: { select: { id: true, name: true, city: true, region: true } },
        },
      },
      interestedVenues: true,
      bookings: {
        where: { cancelledAt: null },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          slot: {
            include: {
              instance: {
                include: {
                  template: { include: { venue: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!musician) {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <div className="text-sm text-white/70">Account not found.</div>
        </main>
      </div>
    );
  }

  const allVenues = await prisma.venue.findMany({
    where: {
      eventTemplates: { some: { isPublic: true } },
    },
    select: { id: true, name: true, city: true, region: true },
    orderBy: [{ city: "asc" }, { name: "asc" }],
    take: 500,
  });

  const homeCity = musician.homeCity?.trim().toLowerCase() ?? "";
  const homeRegion = musician.homeRegion?.trim().toLowerCase() ?? "";
  const secCity = musician.secondaryCity?.trim().toLowerCase() ?? "";
  const secRegion = musician.secondaryRegion?.trim().toLowerCase() ?? "";

  const venuesForInterest = [...allVenues]
    .map((v) => ({
      ...v,
      isLocal: Boolean(
        (homeCity && v.city?.trim().toLowerCase() === homeCity) ||
          (homeRegion && v.region?.trim().toLowerCase() === homeRegion) ||
          (secCity && v.city?.trim().toLowerCase() === secCity) ||
          (secRegion && v.region?.trim().toLowerCase() === secRegion),
      ),
    }))
    .sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      const ac = (a.city ?? "").localeCompare(b.city ?? "");
      if (ac !== 0) return ac;
      return a.name.localeCompare(b.name);
    });

  const tracked = await prisma.musicianVenueInterest.findMany({
    where: { musicianId: musician.id },
    include: { venue: { select: { slug: true, name: true, city: true, region: true } } },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  const displayName =
    [musician.firstName, musician.lastName].filter(Boolean).join(" ").trim() || musician.stageName;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Artist portal</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">Welcome, {musician.stageName}</h1>
            <div className="mt-2 text-sm text-white/70">
              Signed in as <span className="font-mono">{musician.email}</span>
              {displayName !== musician.stageName ? (
                <span className="text-white/50"> · {displayName}</span>
              ) : null}
            </div>
            <p className="mt-3 max-w-2xl text-sm text-white/55">
              You log in with <span className="text-white/75">email</span> (private). Fans and venues find you by{" "}
              <span className="text-white/75">stage name</span> only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/performers"
              >
                Search artists
              </Link>
              <Link
                className="rounded-md border border-white/25 bg-white/5 px-3 py-1.5 text-white/90 hover:border-[rgb(var(--om-neon))]/50 hover:bg-white/10"
                href="/locations"
              >
                Search open mic venues
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="text-white/70 hover:text-white" href="/">
              Home
            </Link>
            <Link className="text-white/70 hover:text-white" href="/logout">
              Logout
            </Link>
          </div>
        </header>

        {q.profile === "saved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            Profile saved.
          </div>
        ) : null}
        {q.profileError === "invalidForm" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            That save request was incomplete or out of date. Refresh the page and try again.
          </div>
        ) : null}
        {q.profileError === "years" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Years playing must be between 0 and 80.
          </div>
        ) : null}
        {q.profileError === "setLength" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Set length must be between 5 and 240 minutes.
          </div>
        ) : null}
        {q.profileError === "venues" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            One or more selected venues are invalid. Refresh and try again.
          </div>
        ) : null}
        {q.profileError === "radius" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Travel radius must be between 1 and 500 miles.
          </div>
        ) : null}
        {q.profileError === "secondaryRadius" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            If you add a second area, set how many miles you’ll travel from that spot (1–500).
          </div>
        ) : null}

        {tracked.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-white">Venues you’re tracking</div>
            <p className="mt-1 text-xs text-white/55">Quick links to open mic pages you’ve saved.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tracked.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/venues/${t.venue.slug}`}
                  className="rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white/90 hover:bg-black/45"
                >
                  {t.venue.name}
                  {t.venue.city ? ` · ${t.venue.city}` : ""}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <ArtistProfileForm musician={musician} allVenues={allVenues} venuesForInterest={venuesForInterest} />

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold">Your upcoming bookings</div>
          {musician.bookings.length === 0 ? (
            <div className="mt-3 text-sm text-white/60">
              No bookings yet. Use your tracked venues or browse{" "}
              <Link className="underline" href="/locations">
                locations
              </Link>{" "}
              to find an open mic and book a slot.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {musician.bookings.map((b) => {
                const v = b.slot.instance.template.venue;
                const date = b.slot.instance.date.toISOString().slice(0, 10);
                return (
                  <div key={b.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{v.name}</div>
                        <div className="mt-1 text-sm text-white/70">
                          {date} · {minutesToTimeLabel(b.slot.startMin)}–{minutesToTimeLabel(b.slot.endMin)} ·{" "}
                          {b.slot.instance.template.title}
                        </div>
                        <div className="mt-2 text-xs text-white/60">
                          <Link className="underline" href={`/venues/${v.slug}`}>
                            View venue page
                          </Link>
                        </div>
                      </div>
                      <div className="text-xs text-white/50">Booking ID: {b.id.slice(0, 8)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
