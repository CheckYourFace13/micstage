"use client";

import { useEffect } from "react";

/**
 * App Router global error boundary. Replaces the root layout, so it must not
 * depend on providers, next/link, theme, auth, or analytics context.
 * Optional Sentry reporting is lazy and must never break rendering or prerender.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale =
    typeof error?.message === "string" &&
    /Failed to find Server Action|server action.*mismatch|was not found on the server/i.test(
      error.message,
    );

  useEffect(() => {
    void import("@sentry/nextjs")
      .then((Sentry) => {
        try {
          Sentry.captureException(error);
        } catch {
          /* ignore reporting failures */
        }
      })
      .catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#000",
          color: "#fff",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            margin: "0 auto",
            display: "flex",
            minHeight: "100dvh",
            maxWidth: 512,
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            MicStage
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: 24, fontWeight: 600 }}>
            {stale ? "Page out of sync after deploy" : "Something went wrong"}
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.65)" }}>
            {stale
              ? "Your tab may be using an older MicStage build than the server. Refresh this page so forms and server actions line up again."
              : "Use the actions below to get back on track."}
          </p>
          <div
            style={{
              marginTop: 40,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                height: 44,
                border: "none",
                borderRadius: 6,
                background: "#ec4899",
                color: "#000",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Refresh page
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: 44,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Plain <a>: global-error replaces the root layout; next/link needs AppRouter context. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional for /_global-error independence */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                background: "#ec4899",
                color: "#000",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Home
            </a>
          </div>
          {stale ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              Hard reload: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac).
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
