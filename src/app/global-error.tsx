"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Root-level error boundary (App Router). Renders outside the main layout.
 * Reports to Sentry when configured via env; never includes secrets in the UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-black font-sans text-white antialiased">
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/50">MicStage</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/65">
            This error was reported automatically. You can try again or return home.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="h-11 rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-md bg-pink-500 px-5 text-sm font-semibold text-black hover:brightness-110"
            >
              Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
