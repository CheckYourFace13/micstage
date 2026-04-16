import Link from "next/link";
import { venueIdsForVenueSession } from "@/lib/authz";
import { unreadForMusician, unreadForVenue } from "@/lib/messaging/service";
import { requirePrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Messages | MicStage",
};

export default async function MessagesInboxPage() {
  const session = await getSession();
  if (!session || (session.kind !== "musician" && session.kind !== "venue")) {
    throw new Error("Expected auth guard middleware for /messages.");
  }

  const prisma = requirePrisma();

  type Row = {
    id: string;
    updatedAt: Date;
    venue: { name: string; slug: string };
    musician: { stageName: string };
    lastMessageAt: Date | null;
    unread: boolean;
  };

  let rows: Row[] = [];

  if (session.kind === "musician") {
    const threads = await prisma.messageThread.findMany({
      where: { musicianId: session.musicianId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        venue: { select: { name: true, slug: true } },
        musician: { select: { stageName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderSide: true } },
      },
    });
    rows = threads.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      venue: t.venue,
      musician: t.musician,
      lastMessageAt: t.lastMessageAt,
      unread: unreadForMusician({
        lastReadByMusicianAt: t.lastReadByMusicianAt,
        messages: t.messages,
      }),
    }));
  } else {
    const ids = await venueIdsForVenueSession(session);
    const threads = await prisma.messageThread.findMany({
      where: { venueId: { in: ids } },
      orderBy: { lastMessageAt: "desc" },
      include: {
        venue: { select: { name: true, slug: true } },
        musician: { select: { stageName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderSide: true } },
      },
    });
    rows = threads.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      venue: t.venue,
      musician: t.musician,
      lastMessageAt: t.lastMessageAt,
      unread: unreadForVenue({
        lastReadByVenueAt: t.lastReadByVenueAt,
        messages: t.messages,
      }),
    }));
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="om-heading text-3xl tracking-wide text-white sm:text-4xl">Messages</h1>
        <Link href="/messages/new" className={lineupSecondaryActionClass}>
          New message
        </Link>
      </div>
      <p className="mt-2 text-sm text-white/60">
        Conversations with venues and artists you&apos;re connected to on MicStage (bookings, saved venues, or past rooms).
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 rounded-xl border border-white/15 bg-white/5 p-6 text-sm text-white/70">
          No conversations yet. Start one from{" "}
          <Link className="text-[rgb(var(--om-neon))] underline" href="/messages/new">
            New message
          </Link>{" "}
          or message everyone booked on a night from your venue dashboard.
        </p>
      ) : (
        <ul className="mt-8 grid gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/messages/${r.id}`}
                className={`flex flex-col gap-1 rounded-xl border px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between ${
                  r.unread
                    ? "border-[rgb(var(--om-neon))]/45 bg-[rgba(var(--om-neon),0.08)]"
                    : "border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/[0.07]"
                }`}
              >
                <div>
                  <div className="font-semibold text-white">
                    {session.kind === "musician" ? r.venue.name : r.musician.stageName}
                    {r.unread ? (
                      <span className="ml-2 inline-block rounded-full bg-[rgb(var(--om-neon))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-white/50">
                    {session.kind === "musician" ? (
                      <span>Venue · /venues/{r.venue.slug}</span>
                    ) : (
                      <span>Artist on MicStage</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-white/45">
                  {r.lastMessageAt ? r.lastMessageAt.toLocaleString() : "—"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-sm text-white/50">
        <Link href={session.kind === "musician" ? "/artist" : "/venue"} className="underline hover:text-white">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
