import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";

const pageTitle = "Find Open Mics & Book Performance Spots | MicStage";

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: pageTitle,
    description:
      "Find verified open mic nights, see available performance times, sign up for a spot, and manage upcoming sets free with MicStage.",
    path: "/artists",
  }),
  title: { absolute: pageTitle },
};

const benefits = [
  "Find verified open mics near you",
  "See actual schedules and open spots",
  "Sign up for available performance times",
  "Keep upcoming bookings in one place",
  "Cancel or manage bookings without chasing DMs",
  "Free to use",
];

const faqs: { q: string; a: string }[] = [
  {
    q: "Is MicStage free?",
    a: "Yes. Performers can browse open mics, sign up for spots, and manage bookings free.",
  },
  {
    q: "Do I need an account just to browse?",
    a: "No. You can explore open mics, maps, and schedules without an account. You only need one to book a spot or manage bookings.",
  },
  {
    q: "Can I choose my start time?",
    a: "When a night has open signup, you pick from the available start times on that night’s lineup.",
  },
  {
    q: "Can I cancel a booking?",
    a: "Yes. You can cancel from your artist dashboard so the spot opens for someone else.",
  },
  {
    q: "How do I know an open mic is real or current?",
    a: "MicStage focuses on nights with schedules and signup where possible, plus venue and host pages you can check before you go.",
  },
  {
    q: "What happens after I sign up?",
    a: "You’re on the lineup for that start time. You’ll see it in your upcoming bookings, and hosts/venues see you on their night list.",
  },
];

export default function ArtistsLandingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          ← MicStage
        </Link>

        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-[rgb(var(--om-neon))]">
          For artists
        </p>
        <h1 className="om-heading mt-3 text-4xl leading-tight tracking-wide sm:text-5xl">
          Find open mics. Grab a spot. Get on stage.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-white/75">
          MicStage helps performers find real open mics, see available times, sign up for a spot, and keep track of
          upcoming sets — free.
        </p>

        <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
          {benefits.map((item) => (
            <li key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/85">
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/find-open-mics"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black hover:brightness-110"
          >
            Find open mics
          </Link>
          <Link
            href="/register/musician"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/25 bg-white/8 px-6 text-base font-semibold text-white hover:bg-white/15"
          >
            Create free artist account
          </Link>
        </div>
        <p className="mt-4 text-sm text-white/55">
          Already have an account?{" "}
          <Link href="/login/musician" className="underline hover:text-white">
            Artist sign in
          </Link>
        </p>

        <section className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Built for performers, not spreadsheets</h2>
          <p className="mt-2 text-sm text-white/70">
            Browse nights near you, open a lineup, book an available start time, and manage your sets in one place —
            without chasing DMs for every signup change.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-white">Artist FAQ</h2>
          <dl className="mt-4 grid gap-4 text-sm">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-medium text-white">{f.q}</dt>
                <dd className="mt-1 text-white/70">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
