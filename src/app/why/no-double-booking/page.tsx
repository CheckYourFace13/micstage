import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "No double-booking: reliable open mic reservations",
  description:
    "MicStage uses slot locking and clear reservations so venues and artists see the same availability—less confusion, stronger trust.",
  path: "/why/no-double-booking",
});

export default function WhyNoDoubleBookingPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="text-xs font-medium uppercase tracking-widest text-white/60">Why MicStage works</div>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">
          No double-booking, less chaos, stronger reputation
        </h1>
        <p className="mt-3 text-sm text-white/75">
          Open mics break down when booking is unclear. MicStage uses managed slot reservations so venues and artists
          see the same availability in real time.
        </p>

        <section className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">How it works</h2>
          <ul className="grid gap-3 text-sm text-white/75">
            <li>Each slot has a single status and is locked once reserved.</li>
            <li>Venues can still house-book when needed while keeping public availability accurate.</li>
            <li>
              Artists get predictable outcomes, which means fewer support messages and less manual correction.
            </li>
          </ul>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Why this helps discovery</h2>
          <p className="text-sm text-white/75">
            Reliable booking flows increase repeat usage and positive mentions. That means more people share your public
            venue links and come back next week—so your room is easier to find through word of mouth and steady online
            presence.
          </p>
        </section>

        <section className="mt-6 grid gap-5 rounded-2xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.06)] p-6">
          <h2 className="text-lg font-semibold text-white">Optional on-premise booking enforcement</h2>
          <p className="text-sm text-white/75">
            For high-demand nights, venues can require on-site booking only. MicStage uses the artist’s phone location
            and the venue coordinates to verify proximity before confirming the slot. This reduces gaming and keeps your
            list accurate for people actually at the mic.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register/venue"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Launch dependable booking for your venue
          </Link>
          <Link
            href="/register/musician"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Artists: claim and manage your slots
          </Link>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 md:hidden">
          <div className="pointer-events-auto rounded-xl border border-[rgba(var(--om-neon),0.5)] bg-black/90 p-3 backdrop-blur">
            <Link
              href="/register/venue"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
            >
              Prevent double-booking at your venue
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
