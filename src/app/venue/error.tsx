"use client";

import { useEffect } from "react";
import Link from "next/link";
import { isLikelyStaleServerActionError } from "@/lib/staleActionError";

export default function VenuePortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[venue portal]", error);
  }, [error]);

  const stale = isLikelyStaleServerActionError(error.message);

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-16 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-widest text-white/50">Venue portal</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">
        {stale ? "This page is out of sync" : "Something went wrong"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/70">
        {stale ? (
          <>
            After a MicStage deploy, an open dashboard tab can reference an old version of the site. A full page reload
            usually fixes forms and buttons that suddenly fail.
          </>
        ) : (
          <>The venue dashboard hit an unexpected error. You can try again or go back to a safe page.</>
        )}
      </p>
      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
        >
          Refresh page
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="h-11 rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Try again
        </button>
        <Link
          href="/login/venue"
          className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Venue sign-in
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-5 text-sm font-medium text-white/80 hover:text-white"
        >
          Home
        </Link>
      </div>
      {stale ? (
        <p className="mt-6 text-xs text-white/45">
          Tip: use a normal refresh first; if the problem persists, try a hard reload (e.g. Ctrl+Shift+R or Cmd+Shift+R).
        </p>
      ) : null}
    </div>
  );
}
