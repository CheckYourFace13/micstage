import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { venueIdsForVenueSession } from "@/lib/authz";
import { markThreadRead } from "@/lib/messaging/service";
import { requirePrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";
import { MessageReplyForm } from "./MessageReplyForm";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage(props: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await props.params;
  const session = await getSession();
  if (!session || (session.kind !== "musician" && session.kind !== "venue")) {
    redirect(`/login/musician?next=${encodeURIComponent(`/messages/${threadId}`)}`);
  }

  const prisma = requirePrisma();
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      musician: { select: { id: true, stageName: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread) notFound();

  if (session.kind === "musician") {
    if (session.musicianId !== thread.musicianId) notFound();
    await markThreadRead(prisma, threadId, "musician");
  } else {
    const ids = await venueIdsForVenueSession(session);
    if (!ids.includes(thread.venueId)) notFound();
    await markThreadRead(prisma, threadId, "venue");
  }

  const title = session.kind === "musician" ? thread.venue.name : thread.musician.stageName;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/messages" className={`${lineupSecondaryActionClass} inline-flex w-auto`}>
          ← Inbox
        </Link>
      </div>
      <h1 className="om-heading mt-6 text-2xl tracking-wide text-white sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-white/55">
        {session.kind === "musician" ? (
          <>
            Venue ·{" "}
            <Link className="text-[rgb(var(--om-neon))] underline" href={`/venues/${thread.venue.slug}`}>
              Public page
            </Link>
          </>
        ) : (
          <>Artist: {thread.musician.stageName}</>
        )}
      </p>

      <ul className="mt-8 grid gap-3">
        {thread.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl border px-4 py-3 text-sm ${
              m.senderSide === "VENUE"
                ? "border-sky-400/35 bg-sky-500/10 text-white/90"
                : "border-emerald-400/35 bg-emerald-500/10 text-white/90"
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
              {m.senderSide === "VENUE" ? thread.venue.name : thread.musician.stageName} ·{" "}
              {m.createdAt.toLocaleString()}
            </div>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ul>

      <MessageReplyForm threadId={thread.id} />
    </main>
  );
}
