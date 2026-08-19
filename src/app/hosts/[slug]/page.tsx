import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata, absoluteUrl } from "@/lib/publicSeo";
import { lineupNavLabelFromYmd } from "@/lib/time";
import { storageYmdUtc } from "@/lib/venuePublicLineup";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const prisma = requirePrisma();
  const host = await prisma.promoterUser.findFirst({
    where: { hostSlug: slug },
    select: { displayName: true },
  });
  const name = host?.displayName ?? "Host";
  return buildPublicMetadata({
    title: `${name} — open mic host on MicStage`,
    description: `Upcoming open mics hosted by ${name}. One link for every room they run.`,
    path: `/hosts/${slug}`,
  });
}

export default async function PublicHostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const prisma = requirePrisma();
  const host = await prisma.promoterUser.findFirst({
    where: { hostSlug: slug },
    select: {
      id: true,
      displayName: true,
      hostSlug: true,
      series: {
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        include: {
          nights: {
            where: { date: { gte: new Date(Date.now() - 86400000) } },
            orderBy: { date: "asc" },
            take: 12,
            include: { venue: { select: { name: true, city: true, region: true, slug: true } } },
          },
        },
      },
    },
  });
  if (!host) notFound();

  const displayName = host.displayName?.trim() || "Host";
  const shareUrl = absoluteUrl(`/hosts/${host.hostSlug ?? slug}`);

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-white/55">Open mic host</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">{displayName}</h1>
        <p className="mt-2 text-sm text-white/70">Upcoming open mics from {displayName}</p>
        <p className="mt-1 text-xs text-white/45">One link for every open mic you run · {shareUrl}</p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white">Open mics</h2>
          {host.series.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">No public series yet.</p>
          ) : (
            <ul className="mt-4 grid gap-4">
              {host.series.map((s) => (
                <li key={s.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-base font-semibold text-white">{s.name}</h3>
                  {s.nights.length === 0 ? (
                    <p className="mt-2 text-sm text-white/55">No upcoming nights scheduled.</p>
                  ) : (
                    <ul className="mt-3 grid gap-2 text-sm">
                      {s.nights.map((n) => (
                        <li key={n.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                          <div className="font-medium text-white">{lineupNavLabelFromYmd(storageYmdUtc(n.date))}</div>
                          <div className="text-white/70">
                            at{" "}
                            <Link href={`/venues/${n.venue.slug}`} className="underline hover:text-white">
                              {n.venue.name}
                            </Link>
                            {n.venue.city ? ` · ${n.venue.city}` : ""}
                          </div>
                          <div className="text-xs text-white/45">Hosted by {displayName}</div>
                          <Link
                            href={`/nights/${n.id}/lineup`}
                            className="mt-2 inline-flex text-xs font-semibold text-[rgb(var(--om-neon))] underline"
                          >
                            {n.signupEnabled ? "Sign up for this night →" : "View lineup →"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-10 text-sm text-white/55">
          Run your own open mics?{" "}
          <Link href="/host" className="underline hover:text-white">
            Start hosting free
          </Link>
        </p>
      </main>
    </div>
  );
}
