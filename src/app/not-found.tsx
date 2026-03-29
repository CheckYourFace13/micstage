import Link from "next/link";
import type { Metadata } from "next";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export const metadata: Metadata = {
  title: "Page not found",
  ...privateNoIndexMetadata,
};

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">MicStage</p>
        <h1 className="om-heading mt-3 text-5xl tracking-wide text-white">404</h1>
        <p className="mt-4 text-lg text-white/85">This page isn’t here.</p>
        <p className="mt-2 text-sm text-white/60">
          The link may be wrong, or the venue or city page may have moved. Try home, find artists, or browse by location.
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-6 text-sm font-semibold text-black hover:brightness-110"
          >
            Home
          </Link>
          <Link
            href="/performers"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
          >
            Find Artists
          </Link>
          <Link
            href="/locations"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
          >
            Find Venues
          </Link>
        </div>
      </main>
    </div>
  );
}
