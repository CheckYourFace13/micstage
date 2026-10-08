import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "FAQ — open mics, hosts, venues, and listings",
  description:
    "Answers about MicStage for performers, hosts, and venues: finding open mics, signups, lineups, claiming listings, verification, and free use.",
  path: "/faq",
});

const SECTIONS: { heading: string; items: { q: string; a: ReactNode }[] }[] = [
  {
    heading: "Performers",
    items: [
      {
        q: "How do I find an open mic near me?",
        a: (
          <>
            Use{" "}
            <Link href="/find-open-mics" className="underline hover:text-white">
              Find open mics
            </Link>
            , the{" "}
            <Link href="/map" className="underline hover:text-white">
              map
            </Link>
            , or a{" "}
            <Link href="/locations" className="underline hover:text-white">
              city / location
            </Link>{" "}
            page. Listings show what we know about schedule and signup when that information is available.
          </>
        ),
      },
      {
        q: "Can I sign up for a slot on MicStage?",
        a: "When a host or venue enables online signup for a night, you can reserve from the public lineup page. Not every listing is bookable — some are discovery-only until the room is claimed and set up.",
      },
      {
        q: "Do I need an account to browse?",
        a: "No. Browsing listings and city pages is free without an account. Creating an artist account is only needed to book slots or manage your profile.",
      },
    ],
  },
  {
    heading: "Hosts",
    items: [
      {
        q: "What is a Host account?",
        a: (
          <>
            A Host runs the night — often a promoter or MC who may not own the venue. One MicStage host account can
            manage multiple venues and recurring nights. Start at{" "}
            <Link href="/host" className="underline hover:text-white">
              For Hosts
            </Link>
            .
          </>
        ),
      },
      {
        q: "How do lineups and signups work?",
        a: "When you publish a night, MicStage can take performer signups and show a public lineup you can share. You control slot length, breaks, and house rules from the host dashboard.",
      },
      {
        q: "Is MicStage free for hosts?",
        a: "Yes. Host signup, night setup, signups, and lineups are free. There is no paid host tier on MicStage today.",
      },
    ],
  },
  {
    heading: "Venues",
    items: [
      {
        q: "How is a Venue different from a Host?",
        a: "A Venue account is for the business that owns or manages the room. A Host account is for the person running the open mic. They are separate roles — the same person can hold both when that matches how the room actually runs.",
      },
      {
        q: "How do I list my venue?",
        a: (
          <>
            Register at{" "}
            <Link href="/register/venue" className="underline hover:text-white">
              Create a venue account
            </Link>{" "}
            or claim an existing public listing if one already represents your room.
          </>
        ),
      },
    ],
  },
  {
    heading: "Listings, claiming, and verification",
    items: [
      {
        q: "What does “verified” mean on a listing?",
        a: "Verified means MicStage has evidence the night is a real open mic (name, place, and open-mic signals) and the listing meets our public quality gates. It does not mean MicStage owns the venue or that Amazon or Google endorses the night.",
      },
      {
        q: "Why does a listing say schedule not published?",
        a: "We only show days and times we actually have. If a trusted schedule is not on file yet, we say so instead of inventing one. Claim the listing or send a correction when you have accurate details.",
      },
      {
        q: "How do I claim a listing?",
        a: (
          <>
            Open the public listing and use the claim path, or follow a claim invite link if you received one. You will
            confirm authority for that room. See also{" "}
            <Link href="/about" className="underline hover:text-white">
              About MicStage
            </Link>
            .
          </>
        ),
      },
      {
        q: "Something on a listing is wrong. How do I fix it?",
        a: "Use the correction form on the listing page, or contact us. Do not invent schedules on MicStage — corrections should match what the room actually runs.",
      },
    ],
  },
  {
    heading: "Pricing and trust",
    items: [
      {
        q: "Is MicStage free?",
        a: "Yes for performers, hosts, and venues for core signup, lineup, and discovery features. Optional editorial pages may include ads or affiliate links; those are separate from booking and dashboards.",
      },
      {
        q: "Where can I read more guides?",
        a: (
          <>
            See{" "}
            <Link href="/resources" className="underline hover:text-white">
              Resources
            </Link>
            , including practical topics like{" "}
            <Link href="/resources/open-mic-gear" className="underline hover:text-white">
              Open Mic Gear
            </Link>
            .
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="om-heading text-4xl tracking-wide">FAQ</h1>
        <p className="mt-3 text-base text-white/80">
          Straight answers about finding open mics, running a night, claiming listings, and what MicStage does — and
          does not — guarantee.
        </p>

        <div className="mt-10 grid gap-10">
          {SECTIONS.map((section) => (
            <section key={section.heading} aria-labelledby={`faq-${section.heading}`}>
              <h2 id={`faq-${section.heading}`} className="text-2xl font-semibold">
                {section.heading}
              </h2>
              <dl className="mt-4 grid gap-5">
                {section.items.map((item) => (
                  <div key={item.q} className="border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
                    <dt className="font-medium text-white">{item.q}</dt>
                    <dd className="mt-2 text-sm leading-6 text-white/75">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-white/55">
          Still stuck?{" "}
          <Link href="/contact" className="underline hover:text-white">
            Contact
          </Link>{" "}
          or read the{" "}
          <Link href="/about" className="underline hover:text-white">
            About
          </Link>{" "}
          page.
        </p>
      </main>
    </div>
  );
}
