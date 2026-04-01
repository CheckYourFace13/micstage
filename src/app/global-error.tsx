"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useCallback, useEffect } from "react";

function pathnamePrefix(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function tryAgainHref(): string {
  const p = pathnamePrefix();
  if (p === "/artist" || p.startsWith("/artist/")) return "/artist";
  if (p === "/venue" || p.startsWith("/venue/")) return "/venue";
  return "";
}

function signInAgainHref(): string {
  const p = pathnamePrefix();
  if (p === "/artist" || p.startsWith("/artist/")) return "/login/musician";
  if (p === "/venue" || p.startsWith("/venue/")) return "/login/venue";
  return "/login/musician";
}

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

  const onTryAgain = useCallback(() => {
    const target = tryAgainHref();
    if (target) {
      window.location.assign(target);
      return;
    }
    reset();
  }, [reset]);

  const portalRetry = tryAgainHref();
  const signInHref = signInAgainHref();

  return (
    <html lang="en">
      <body className="min-h-dvh bg-black font-sans text-white antialiased">
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/50">MicStage</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/65">
            This error was reported automatically. Use the actions below to get back on track.
          </p>
          <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <button
              type="button"
              onClick={onTryAgain}
              className="h-11 rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              {portalRetry ? "Back to dashboard" : "Try again"}
            </button>
            <Link
              href={signInHref}
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Sign in again
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-md bg-pink-500 px-5 text-sm font-semibold text-black hover:brightness-110"
            >
              Home
            </Link>
          </div>
          {!portalRetry ? (
            <p className="mt-4 text-xs text-white/45">
              “Try again” retries this page. If the problem continues, go home or sign in again.
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
