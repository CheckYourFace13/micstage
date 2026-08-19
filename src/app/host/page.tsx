import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Run every open mic you host — free | MicStage",
  description:
    "One MicStage host account manages all your open mics — multiple venues, recurring nights, performer signups, and lineups. Free open mic host app for comedy, music, and poetry.",
  path: "/host",
});

export default function HostLandingPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          ← MicStage
        </Link>

        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-[rgb(var(--om-neon))]">
          For hosts
        </p>
        <h1 className="om-heading mt-3 text-4xl leading-tight tracking-wide sm:text-5xl">
          Run every open mic you host — free.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-white/75">
          One MicStage account can manage <strong className="text-white">all of your open mics</strong>, even if you host at
          different venues. You don&apos;t need to own the venue — just pick where each night happens.
        </p>

        <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
          {[
            "One account, many open mics",
            "Multiple venues — no venue ownership required",
            "Recurring weekly nights",
            "Change venue when your room moves",
            "Performer signups & lineups",
            "One shareable host page",
          ].map((item) => (
            <li key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/85">
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register/promoter"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-base font-semibold text-black hover:brightness-110"
          >
            Start hosting free
          </Link>
          <Link
            href="/login/promoter"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/25 bg-white/8 px-6 text-base font-semibold text-white hover:bg-white/15"
          >
            Host sign in
          </Link>
        </div>

        <p className="mt-8 text-sm text-white/55">
          Own or manage the <em>venue business</em> itself?{" "}
          <Link href="/register/venue" className="underline hover:text-white">
            Manage my venue
          </Link>{" "}
          instead — that&apos;s a separate account.
        </p>

        <section className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Open mic host app — built for real hosts</h2>
          <p className="mt-2 text-sm text-white/70">
            MicStage is free host software for open mic signup, lineup management, and scheduling — whether you run one room or
            hop between venues every week. No spreadsheets. No pretending you own the bar.
          </p>
        </section>
      </main>
    </div>
  );
}
