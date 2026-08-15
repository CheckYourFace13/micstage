import Link from "next/link";
import type { Metadata } from "next";
import {
  COMPARE_FEATURE_KEYS,
  COMPETITOR_COMPARE_VERIFIED_AT,
  COMPETITORS,
  type CompareMark,
} from "@/lib/compare/competitors";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Open mic apps & signup platforms compared",
  description:
    "A factual comparison of open mic discovery and host tools — MicStage, Ajar Mic, Open Mic Search, CocoScout, and OpenMic.US. Prices verified from official sources.",
  path: "/compare",
});

function markLabel(m: CompareMark): string {
  switch (m) {
    case "YES":
      return "Yes";
    case "NO":
      return "No";
    case "PARTIAL":
      return "Partial";
    case "COMING_LATER":
      return "Later";
    default:
      return "—";
  }
}

function markClass(m: CompareMark): string {
  switch (m) {
    case "YES":
      return "text-emerald-200";
    case "NO":
      return "text-white/40";
    case "PARTIAL":
      return "text-amber-100/90";
    case "COMING_LATER":
      return "text-white/55";
    default:
      return "text-white/35";
  }
}

export default function ComparePage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">Compare</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl md:text-5xl">
          Open mic apps &amp; signup platforms compared
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-white/70 md:text-base">
          There are several good tools depending on what you need. Some focus on the night itself (timers, TV displays).
          Others are directories or full production platforms. MicStage is built to help you{" "}
          <span className="text-white">find open mics, run the night, and organize performer signups — free</span>.
        </p>
        <p className="mt-3 text-xs text-white/45">
          Pricing and feature claims last verified from official public pages on{" "}
          <time dateTime={COMPETITOR_COMPARE_VERIFIED_AT}>{COMPETITOR_COMPARE_VERIFIED_AT}</time>. Competitor products
          change — check their sites before deciding.
        </p>

        <section className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
                <th className="px-3 py-3 font-medium sm:px-4">Area</th>
                {COMPETITORS.map((c) => (
                  <th key={c.id} className="px-3 py-3 font-medium sm:px-4">
                    <a href={c.url} className="text-white underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10">
                <td className="px-3 py-3 text-white/60 sm:px-4">Performer cost</td>
                {COMPETITORS.map((c) => (
                  <td key={c.id} className="px-3 py-3 text-white/85 sm:px-4">
                    {c.performerCost}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-white/10">
                <td className="px-3 py-3 text-white/60 sm:px-4">Venue / host cost</td>
                {COMPETITORS.map((c) => (
                  <td key={c.id} className="px-3 py-3 text-white/85 sm:px-4">
                    {c.hostCost}
                  </td>
                ))}
              </tr>
              {COMPARE_FEATURE_KEYS.map((f) => (
                <tr key={f.key} className="border-b border-white/10">
                  <td className="px-3 py-3 text-white/60 sm:px-4">{f.label}</td>
                  {COMPETITORS.map((c) => {
                    const m = c.features[f.key] ?? "UNKNOWN";
                    return (
                      <td key={c.id} className={`px-3 py-3 font-medium sm:px-4 ${markClass(m)}`}>
                        {markLabel(m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          {COMPETITORS.map((c) => (
            <article key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">{c.name}</h2>
              <p className="mt-2 text-sm text-white/70">{c.notes}</p>
              <ul className="mt-3 list-inside list-disc text-xs text-white/45">
                {c.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} className="underline hover:text-white" target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-12 max-w-2xl">
          <h2 className="text-xl font-semibold text-white">Where MicStage fits</h2>
          <p className="mt-3 text-sm text-white/70">
            MicStage is free for performers, promoters, and venues on the current product. It is strongest when you want
            discovery, a public listing, recurring schedule, optional online signups, and a shareable lineup in one place —
            without a subscription.
          </p>
          <p className="mt-3 text-sm text-white/70">
            If you need a venue TV display, set timer, or bucket draw tonight, tools like Ajar Mic or Open Mic Search may
            fit better for that part of the night. MicStage does not claim those features yet.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/find-open-mics"
              className="inline-flex h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-base font-semibold text-black hover:brightness-110"
            >
              Find open mics
            </Link>
            <Link
              href="/register/venue"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
            >
              Run your open mic free
            </Link>
          </div>
        </section>

        <p className="mt-10 text-xs text-white/40">
          SetDrop / SetDrop-style gig marketplace pricing was not independently verified from an official public pricing
          page on {COMPETITOR_COMPARE_VERIFIED_AT}, so it is omitted rather than guessed.
        </p>
      </main>
    </div>
  );
}
