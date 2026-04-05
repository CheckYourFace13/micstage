import Link from "next/link";
import type { MusicianUser } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";
import { requirePrisma } from "@/lib/prisma";
import { requireMusicianSession } from "@/lib/authz";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { minutesToTimeLabel } from "@/lib/time";
import { ArtistProfileForm } from "./ArtistProfileForm";

const bookingPortalInclude = {
  slot: {
    include: {
      instance: {
        include: {
          template: { include: { venue: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

type PortalBooking = Prisma.BookingGetPayload<{ include: typeof bookingPortalInclude }>;
type PortalPastVenue = Prisma.MusicianPastVenueGetPayload<{
  include: { venue: { select: { id: true; name: true; city: true; region: true } } };
}>;

type MusicianPortalUser = MusicianUser & {
  pastVenues: PortalPastVenue[];
  interestedVenues: { venueId: string }[];
  bookings: PortalBooking[];
};

export const metadata = {
  title: "Artist portal | MicStage",
};

/** Session + bookings depend on request cookies; avoid any static/prerender mismatch after login. */
export const dynamic = "force-dynamic";

function isRenderableBooking(b: {
  slot: null | {
    startMin: number;
    endMin: number;
    instance: null | {
      date: Date;
      template: null | { title: string; venue: null | { name: string; slug: string } };
    };
  };
}): boolean {
  const v = b.slot?.instance?.template?.venue;
  const d = b.slot?.instance?.date;
  return Boolean(v && d instanceof Date && !Number.isNaN(d.getTime()));
}

type VenuePickRow = { id: string; name: string; city: string | null; region: string | null };
type TrackedRow = {
  id: string;
  venue: { slug: string; name: string; city: string | null; region: string | null };
};

type ArtistPortalLoad =
  | { status: "ok"; musician: MusicianPortalUser; allVenues: VenuePickRow[]; tracked: TrackedRow[] }
  | { status: "not_found" }
  | { status: "error" };

function logArtistPortalFailure(phase: string, e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`[artist portal] ${phase}`, e.code, e.meta ?? {}, e.message);
  } else if (e instanceof Prisma.PrismaClientValidationError) {
    console.error(`[artist portal] ${phase} (validation)`, e.message);
  } else {
    console.error(`[artist portal] ${phase}`, e);
  }
}

async function loadArtistPortalData(musicianId: string): Promise<ArtistPortalLoad> {
  let prisma: ReturnType<typeof requirePrisma>;
  try {
    prisma = requirePrisma();
  } catch (e) {
    logArtistPortalFailure("requirePrisma", e);
    return { status: "error" };
  }

  let base: MusicianUser | null = null;
  try {
    base = await prisma.musicianUser.findUnique({ where: { id: musicianId } });
  } catch (e) {
    logArtistPortalFailure("musicianUser.findUnique (scalars)", e);
    return { status: "error" };
  }
  if (!base) return { status: "not_found" };

  let pastVenues: PortalPastVenue[] = [];
  try {
    pastVenues = await prisma.musicianPastVenue.findMany({
      where: { musicianId: base.id },
      include: {
        venue: { select: { id: true, name: true, city: true, region: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    logArtistPortalFailure("musicianPastVenue.findMany", e);
  }

  type InterestRow = Prisma.MusicianVenueInterestGetPayload<{
    include: { venue: { select: { slug: true; name: true; city: true; region: true } } };
  }>;
  let interestRows: InterestRow[] = [];
  try {
    interestRows = await prisma.musicianVenueInterest.findMany({
      where: { musicianId: base.id },
      include: { venue: { select: { slug: true, name: true, city: true, region: true } } },
      orderBy: { createdAt: "desc" },
    });
  } catch (e) {
    logArtistPortalFailure("musicianVenueInterest.findMany", e);
  }

  const interestedVenues = interestRows.map((r) => ({ venueId: r.venueId }));
  const tracked: TrackedRow[] = interestRows.slice(0, 24).map((r) => ({
    id: r.id,
    venue: r.venue,
  }));

  let bookings: PortalBooking[] = [];
  try {
    bookings = await prisma.booking.findMany({
      where: { musicianId: base.id, cancelledAt: null },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: bookingPortalInclude,
    });
  } catch (e) {
    logArtistPortalFailure("booking.findMany (upcoming)", e);
  }

  let allVenues: VenuePickRow[] = [];
  try {
    allVenues = await prisma.venue.findMany({
      where: {
        eventTemplates: { some: { isPublic: true } },
      },
      select: { id: true, name: true, city: true, region: true },
      orderBy: [{ city: "asc" }, { name: "asc" }],
      take: 500,
    });
  } catch (e) {
    logArtistPortalFailure("venue.findMany (interest picker)", e);
  }

  const musician: MusicianPortalUser = {
    ...base,
    pastVenues,
    interestedVenues,
    bookings,
  };

  return { status: "ok", musician, allVenues, tracked };
}

export default async function ArtistPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; profileError?: string }>;
}) {
  const q = await searchParams;
  const session = await requireMusicianSession();

  const data = await loadArtistPortalData(session.musicianId);

  if (data.status === "not_found") {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="text-sm text-white/80">
            We couldn’t find this artist account. You may need to{" "}
            <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/register/musician">
              register
            </Link>{" "}
            again or{" "}
            <Link className="underline hover:text-white" href="/login/musician">
              sign in
            </Link>{" "}
            with a different email.
          </p>
        </main>
      </div>
    );
  }

  if (data.status === "error") {
    return (
      <div className="min-h-dvh bg-black text-white">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <h1 className="om-heading text-2xl tracking-wide text-white">Artist dashboard</h1>
          <p className="mt-3 text-sm text-white/75">
            We couldn’t load your dashboard right now (connection or server issue). Your account is still signed in.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
              href={ARTIST_DASHBOARD_HREF}
            >
              Retry dashboard
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
              href="/"
            >
              Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { musician, allVenues, tracked } = data;

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

  const displayName =
    [musician.firstName, musician.lastName].filter(Boolean).join(" ").trim() || musician.stageName;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Artist portal</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">
              Welcome, {musician.stageName?.trim() || "Artist"}
            </h1>
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
            <div className="mt-4 max-w-2xl rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Suggested next steps</div>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:text-white/40">
                <li>
                  Complete your profile below—especially <span className="text-white/85">stage name</span> and where you
                  play.
                </li>
                <li>Track venues you like, or browse upcoming performers by discovery market.</li>
                <li>
                  Book a slot from any venue&apos;s public page while signed in—your upcoming gigs appear in{" "}
                  <span className="text-white/85">Your upcoming bookings</span> below.
                </li>
              </ol>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
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
                Browse by area
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="text-white/70 hover:text-white" href="/">
              Home
            </Link>
            <LogoutVenueArtistButton
              label="Logout"
              className="text-white/70 hover:text-white"
            />
          </div>
        </header>

        {q.profile === "saved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Profile saved.</span> Public search and venue discovery use
            your stage-facing details—give it a moment to update everywhere.
          </div>
        ) : null}
        {q.profile === "imageUploaded" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
            <span className="font-semibold text-emerald-100/95">Photo uploaded.</span> It is saved on your profile. You can still
            change the URL field and save if you prefer a different image.
          </div>
        ) : null}
        {q.profileError === "uploadMissing" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            Choose an image file before uploading.
          </div>
        ) : null}
        {q.profileError === "upload_unsupported_type" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That file type is not supported. Use JPEG, PNG, WebP, or GIF.
          </div>
        ) : null}
        {q.profileError === "upload_too_large" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            That file is too large (max about 2.5MB). Try a smaller image.
          </div>
        ) : null}
        {q.profileError === "upload_blob_failed" || q.profileError === "upload_local_write_failed" ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.45)] bg-[rgba(var(--om-neon),0.1)] px-4 py-3 text-sm text-white">
            Upload storage failed. Try again in a moment; if it keeps happening, contact support.
          </div>
        ) : null}
        {q.profileError === "upload_uploads_not_configured" ? (
          <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-white">
            File uploads are not enabled on this server. Paste an image URL instead, or ask your host to configure blob storage.
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

        {tracked.filter((t) => t.venue?.slug).length > 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-white">Venues you’re tracking</div>
            <p className="mt-1 text-xs text-white/55">Quick links to open mic pages you’ve saved.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tracked
                .filter((t) => t.venue?.slug)
                .map((t) => (
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

        <ArtistProfileForm musician={musician} venuesForInterest={venuesForInterest} />

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-white">Your upcoming bookings</div>
          <p className="mt-1 text-xs text-white/50">
            Confirmed reservations from venue pages show here—same live schedule the venue publishes.
          </p>
          {(() => {
            const bookingRows = (musician.bookings ?? []).filter(isRenderableBooking);
            if (bookingRows.length === 0) {
              return (
                <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-white/65">
                  <p className="font-medium text-white/80">No upcoming gigs yet</p>
                  <p className="mt-2">
                    Open a venue&apos;s public page, pick an open time, and reserve while signed in. Start from{" "}
                    <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/locations">
                      discovery markets
                    </Link>{" "}
                    or venues you&apos;re tracking above.
                  </p>
                </div>
              );
            }
            return (
              <div className="mt-4 grid gap-3">
                {bookingRows.map((b: PortalBooking) => {
                  const v = b.slot!.instance!.template!.venue!;
                  const date = b.slot!.instance!.date.toISOString().slice(0, 10);
                  const tpl = b.slot!.instance!.template!;
                  return (
                    <div key={b.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{v.name}</div>
                          <div className="mt-1 text-sm text-white/70">
                            {date} · {minutesToTimeLabel(b.slot!.startMin)}–{minutesToTimeLabel(b.slot!.endMin)} ·{" "}
                            {tpl.title}
                          </div>
                          {tpl.description ? (
                            <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/55">{tpl.description}</p>
                          ) : null}
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
            );
          })()}
        </section>
      </main>
    </div>
  );
}
