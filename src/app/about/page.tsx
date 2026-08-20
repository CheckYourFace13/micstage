import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "About MicStage",
  description:
    "What MicStage is, who it is for, how open mic listings are verified and updated, and the difference between Host and Venue accounts.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-6 py-14 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">MicStage</p>
        <h1 className="om-heading mt-2 text-4xl tracking-wide text-white">About MicStage</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/75">
          MicStage is a free platform for finding and running open mic nights. Performers use it to see schedules and
          sign up when a room offers online signup. Hosts and venues use it to publish a night, take signups, and share
          a lineup.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Who it is for</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/75">
            <li>
              <strong className="text-white">Performers</strong> — find open mics near you, check the night, and sign up
              when the listing allows it.
            </li>
            <li>
              <strong className="text-white">Hosts</strong> — people who run the night, even if they do not own the bar.
              One account can cover multiple venues and recurring nights.
            </li>
            <li>
              <strong className="text-white">Venues</strong> — the business that owns or manages the room. Separate from
              a host account.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Host vs venue</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            A host books rooms and runs the show. A venue account is for the business that operates the space. You do
            not need to own the venue to host on MicStage. If you own the room,{" "}
            <Link href="/register/venue" className="underline hover:text-white">
              register as a venue
            </Link>
            . If you run nights at one or more rooms,{" "}
            <Link href="/host" className="underline hover:text-white">
              start as a host
            </Link>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">How listings are verified</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Public listings are not a dump of search results. A listing is shown as verified when we can tie it to a
            real place and to explicit open-mic evidence (the name, a published schedule, or a trusted source page).
            Pages still tell you when a schedule was last confirmed. We do not invent missing times, hosts, or signup
            rules.
          </p>
          <p className="mt-3 text-sm text-white/75">
            More detail:{" "}
            <Link href="/resources/how-micstage-verifies-open-mic-listings" className="underline hover:text-white">
              How MicStage verifies and updates listings
            </Link>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Corrections and claims</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Anyone can suggest a correction on a listing. If you run the night, claim it so you can manage schedule,
            signups, and lineup yourself. Claimed listings redirect to the live venue or host page.
          </p>
        </section>

        <p className="mt-12 text-sm text-white/60">
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
            Find open mics
          </Link>
          {" · "}
          <Link href="/contact" className="underline hover:text-white">
            Contact
          </Link>
        </p>
      </main>
    </div>
  );
}
