import Link from "next/link";
import type { Metadata } from "next";
import { getPrismaOrNull } from "@/lib/prisma";
import { asStringArrayJson } from "@/lib/musicianProfile";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { PublicDataUnavailable } from "@/components/PublicDataUnavailable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPublicMetadata({
  title: "Find open mic performers by stage name",
  description:
    "Search MicStage artists by public stage name. Discover open mic regulars and hire-ready acts—legal names stay private.",
  path: "/performers",
});

export default async function PerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return <PublicDataUnavailable title="Performer directory unavailable" />;
  }

  try {
    // Scan a bounded set then filter (stage name contains).
    const base = await prisma.musicianUser.findMany({
      select: {
        id: true,
        stageName: true,
        bio: true,
        imageUrl: true,
        homeCity: true,
        homeRegion: true,
        secondaryCity: true,
        secondaryRegion: true,
        openToHire: true,
        travelRadiusMiles: true,
        secondaryRadiusMiles: true,
        specializations: true,
        instruments: true,
        hireRateDescription: true,
        setLengthMinutes: true,
      },
      orderBy: { stageName: "asc" },
      take: query ? 400 : 80,
    });

    const qLower = query.toLowerCase();
    const musicians = query
      ? base.filter((m) => m.stageName.toLowerCase().includes(qLower)).slice(0, 80)
      : base;

    return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-white/60">Performers</div>
            <h1 className="om-heading mt-2 text-4xl tracking-wide">Search by stage name</h1>
            <p className="mt-2 max-w-xl text-sm text-white/65">
              MicStage lists <span className="text-white/85">stage / performer names only</span>. First and last names
              from artist accounts are private and never appear here.
            </p>
          </div>
          <Link href="/locations" className="text-sm text-white/70 hover:text-white">
            Open mic venues
          </Link>
        </div>

        <form method="get" className="mt-8 flex flex-wrap gap-3">
          <label className="grid min-w-[200px] flex-1 gap-1 text-sm">
            <span className="text-white/80">Stage name contains</span>
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="e.g. Neon, The Duo…"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
            />
          </label>
          <button
            type="submit"
            className="mt-6 h-11 self-end rounded-md border border-white/15 bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 sm:mt-0"
          >
            Search
          </button>
        </form>

        {!query ? (
          <p className="mt-6 text-sm text-white/50">
            Enter part of a performer’s stage name, or leave blank to browse (up to 80 listings, A–Z).
          </p>
        ) : null}

        <div className="mt-8 grid gap-4">
          {musicians.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No performers match that search yet.
            </div>
          ) : (
            musicians.map((m) => {
              const specs = asStringArrayJson(m.specializations);
              const insts = asStringArrayJson(m.instruments);
              const homeLoc = [m.homeCity, m.homeRegion].filter(Boolean).join(", ");
              const secLoc = [m.secondaryCity, m.secondaryRegion].filter(Boolean).join(", ");
              const rateLine =
                m.hireRateDescription?.trim() ||
                (m.openToHire ? "Open to hire — contact via socials / website on full profile (coming soon)." : null);

              return (
                <article
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{m.stageName}</h2>
                      {m.openToHire ? (
                        <span className="mt-1 inline-block rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                          Open to hire
                        </span>
                      ) : null}
                    </div>
                    {m.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.imageUrl}
                        alt=""
                        className="h-14 w-14 rounded-lg border border-white/10 object-cover"
                      />
                    ) : null}
                  </div>

                  {homeLoc ? (
                    <p className="mt-2 text-sm text-white/70">
                      <span className="text-white/50">Home base:</span> {homeLoc}
                      {m.travelRadiusMiles != null ? ` · up to ${m.travelRadiusMiles} mi` : null}
                    </p>
                  ) : null}
                  {secLoc ? (
                    <p className="mt-1 text-sm text-white/65">
                      <span className="text-white/50">Also plays near:</span> {secLoc}
                      {m.secondaryRadiusMiles != null ? ` · up to ${m.secondaryRadiusMiles} mi` : null}
                    </p>
                  ) : null}

                  {m.bio ? <p className="mt-3 text-sm text-white/75 line-clamp-4">{m.bio}</p> : null}

                  {(specs.length > 0 || insts.length > 0) && (
                    <p className="mt-2 text-xs text-white/50">
                      {specs.length > 0 ? <span>Specialties: {specs.join(", ")}</span> : null}
                      {specs.length > 0 && insts.length > 0 ? " · " : null}
                      {insts.length > 0 ? <span>Instruments: {insts.join(", ")}</span> : null}
                    </p>
                  )}

                  {rateLine ? (
                    <p className="mt-2 text-sm text-white/70">
                      <span className="text-white/50">Rate / fee:</span> {rateLine}
                      {m.setLengthMinutes != null ? (
                        <span className="text-white/50"> · ~{m.setLengthMinutes} min set for that rate</span>
                      ) : null}
                    </p>
                  ) : m.setLengthMinutes != null ? (
                    <p className="mt-2 text-sm text-white/60">
                      Typical offer: ~{m.setLengthMinutes} min set (see rate notes on profile when added).
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        <p className="mt-10 text-center text-sm text-white/50">
          Artist?{" "}
          <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/register/musician">
            Create an account
          </Link>{" "}
          or{" "}
          <Link className="underline hover:text-white" href="/login/musician">
            log in
          </Link>
          .
        </p>
      </main>
    </div>
    );
  } catch {
    return <PublicDataUnavailable title="Performer directory unavailable" />;
  }
}
