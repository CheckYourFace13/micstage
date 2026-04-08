import Link from "next/link";
import { redirect } from "next/navigation";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { venueIdsForSession } from "@/lib/authz";
import { loadEligibleMusiciansForVenue, loadEligibleVenuesForMusician } from "@/lib/messaging/eligibility";
import { requirePrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";
import { startThreadMusicianAction, startThreadVenueAction } from "../actions";
import { VenueNewMessageForm } from "./VenueNewMessageForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New message | MicStage",
};

export default async function NewMessagePage(props: { searchParams: Promise<{ err?: string; venueId?: string }> }) {
  const q = await props.searchParams;
  const session = await getSession();
  if (!session || (session.kind !== "musician" && session.kind !== "venue")) {
    redirect("/login/musician?next=%2Fmessages%2Fnew");
  }

  const prisma = requirePrisma();

  const err = q.err;
  const errLine =
    err === "invalid"
      ? "Please choose a recipient and enter a message."
      : err === "eligibility"
        ? "You can only message venues and artists you’re connected with on MicStage."
        : err === "forbidden"
          ? "You don’t have access to that venue."
          : null;

  if (session.kind === "musician") {
    const venues = await loadEligibleVenuesForMusician(prisma, session.musicianId);
    const defaultVenueId =
      q.venueId && venues.some((v) => v.id === q.venueId) ? q.venueId : "";
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/messages" className={`${lineupSecondaryActionClass} mb-6 inline-flex w-auto`}>
          ← Inbox
        </Link>
        <h1 className="om-heading text-2xl tracking-wide text-white sm:text-3xl">Message a venue</h1>
        <p className="mt-2 text-sm text-white/60">
          Only venues you’ve booked, saved, or listed as a past MicStage room appear here.
        </p>
        {errLine ? (
          <p className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            {errLine}
          </p>
        ) : null}
        {venues.length === 0 ? (
          <p className="mt-6 text-sm text-white/55">
            No eligible venues yet — book a slot or add venues from your artist dashboard.
          </p>
        ) : (
          <form action={startThreadMusicianAction} className="mt-6 grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Venue</span>
              <select
                name="venueId"
                required
                defaultValue={defaultVenueId}
                className="h-11 rounded-md border border-white/15 bg-black/40 px-3 text-white"
              >
                <option value="">Select…</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` — ${v.city}${v.region ? `, ${v.region}` : ""}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">Message</span>
              <textarea
                name="body"
                required
                rows={5}
                className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
                placeholder="Introduce yourself or ask a question…"
              />
            </label>
            <FormSubmitButton label="Send message" pendingLabel="Sending…" className={lineupPrimaryActionClass} />
          </form>
        )}
      </main>
    );
  }

  const allowedVenueIds = await venueIdsForSession(session);
  const venueRows = await prisma.venue.findMany({
    where: { id: { in: allowedVenueIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const defaultVenueId = venueRows[0]?.id ?? "";
  const musiciansByVenue: Record<string, Awaited<ReturnType<typeof loadEligibleMusiciansForVenue>>> = {};
  for (const vid of allowedVenueIds) {
    musiciansByVenue[vid] = await loadEligibleMusiciansForVenue(prisma, vid);
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/messages" className={`${lineupSecondaryActionClass} mb-6 inline-flex w-auto`}>
        ← Inbox
      </Link>
      <h1 className="om-heading text-2xl tracking-wide text-white sm:text-3xl">Message an artist</h1>
      <p className="mt-2 text-sm text-white/60">
        Artists appear here when they’ve booked your room, saved your venue, or listed you as a past MicStage venue.
      </p>
      {errLine ? (
        <p className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
          {errLine}
        </p>
      ) : null}
      {venueRows.length === 0 ? (
        <p className="mt-6 text-sm text-white/55">No venues on this account.</p>
      ) : (
        <VenueNewMessageForm
          venueRows={venueRows}
          musiciansByVenue={musiciansByVenue}
          initialVenueId={defaultVenueId}
          action={startThreadVenueAction}
        />
      )}
    </main>
  );
}
