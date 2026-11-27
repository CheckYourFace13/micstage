"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_LOGOUT_PATH } from "@/lib/adminEdge";
import type { AuthUiRole } from "@/lib/authUiState";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";
import { VenueChangeRequestForm } from "@/app/venue/VenueChangeRequestForm";

type AuthUiPayload = {
  role: AuthUiRole;
  signedInLine: string | null;
  signedInHref: string | null;
  venueSessionEmail: string | null;
  messageUnread: number;
};

function roleBadgeLink(text: string, href: string) {
  return (
    <Link
      href={href}
      className="inline-flex max-w-[min(100%,18rem)] items-center truncate rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 hover:brightness-110 sm:max-w-xs sm:text-[11px]"
    >
      {text}
    </Link>
  );
}

/** Progressive auth chrome — keeps anonymous header HTML cacheable. */
export function SiteHeaderAuthClient() {
  const [auth, setAuth] = useState<AuthUiPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/auth-ui", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as AuthUiPayload;
        if (!cancelled) setAuth(data);
      } catch {
        // Keep anonymous SSR chrome.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const role = auth?.role ?? "public";
  const signedInLine = auth?.signedInLine ?? null;
  const signedInHref = auth?.signedInHref ?? null;
  const venueSessionEmail = auth?.venueSessionEmail ?? null;
  const messageUnread = auth?.messageUnread ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
        {role === "admin" ? (
          <>
            {roleBadgeLink("ADMIN", "/internal/admin")}
            <form action={ADMIN_LOGOUT_PATH} method="get" className="inline">
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-100/90 hover:bg-amber-500/15 hover:text-amber-50 sm:text-xs"
              >
                Sign out admin
              </button>
            </form>
          </>
        ) : null}
        {role === "venue" && signedInLine && signedInHref ? (
          <>
            {venueSessionEmail ? (
              <VenueChangeRequestForm defaultEmail={venueSessionEmail} variant="header" />
            ) : null}
            <Link
              href={signedInHref}
              className="max-w-[min(100%,20rem)] truncate text-right text-[12px] font-medium leading-snug text-sky-100/95 underline decoration-sky-400/40 decoration-1 underline-offset-2 hover:decoration-sky-300/70 sm:max-w-md sm:text-sm"
            >
              {signedInLine}
            </Link>
            <LogoutVenueArtistButton
              label="Sign out"
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
            />
          </>
        ) : null}
        {role === "artist" && signedInLine && signedInHref ? (
          <>
            <Link
              href={signedInHref}
              className="max-w-[min(100%,20rem)] truncate text-right text-[12px] font-medium leading-snug text-emerald-100/95 underline decoration-emerald-400/40 decoration-1 underline-offset-2 hover:decoration-emerald-300/70 sm:max-w-md sm:text-sm"
            >
              {signedInLine}
            </Link>
            <LogoutVenueArtistButton
              label="Sign out"
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
            />
          </>
        ) : null}
        {role === "promoter" && signedInLine && signedInHref ? (
          <>
            <Link
              href={signedInHref}
              className="max-w-[min(100%,20rem)] truncate text-right text-[12px] font-medium leading-snug text-violet-100/95 underline decoration-violet-400/40 decoration-1 underline-offset-2 hover:decoration-violet-300/70 sm:max-w-md sm:text-sm"
            >
              {signedInLine}
            </Link>
            <LogoutVenueArtistButton
              label="Sign out"
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6 sm:gap-y-2">
        <nav
          className="flex flex-wrap items-center justify-end gap-x-1 gap-y-2 text-xs font-medium sm:text-sm"
          aria-label="Discover"
        >
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 font-semibold text-[rgb(var(--om-neon))] hover:bg-white/10 hover:brightness-110 sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/find-open-mics"
          >
            Find Mics
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-white/75 hover:bg-white/10 hover:text-white sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/map"
          >
            Map
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-white/75 hover:bg-white/10 hover:text-white sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/host"
          >
            For Hosts
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-white/75 hover:bg-white/10 hover:text-white sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/register/venue"
          >
            For Venues
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-white/75 hover:bg-white/10 hover:text-white sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/artists"
          >
            For Artists
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-white/75 hover:bg-white/10 hover:text-white sm:min-h-0 sm:px-3 sm:py-1.5"
            href="/resources"
          >
            Resources
          </Link>
          {role === "artist" || role === "venue" ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-white/25 bg-white/[0.07] px-3 py-2 font-medium text-white hover:border-white/40 hover:bg-white/12 sm:min-h-0 sm:px-3 sm:py-1.5"
              href="/messages"
            >
              Messages
              {messageUnread > 0 ? (
                <span className="ml-1.5 rounded-full bg-[rgb(var(--om-neon))] px-1.5 py-0.5 text-[10px] font-bold text-black">
                  {messageUnread > 99 ? "99+" : messageUnread}
                </span>
              ) : null}
            </Link>
          ) : null}
          {role === "promoter" ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-2 font-medium text-violet-100 hover:border-violet-400/50 hover:bg-violet-500/15 sm:min-h-0 sm:px-3 sm:py-1.5"
              href="/promoter"
            >
              Promoter
            </Link>
          ) : null}
        </nav>
        {role === "public" ? (
          <nav
            className="flex flex-wrap items-center justify-end gap-x-1 gap-y-2 border-t border-white/10 pt-2 text-xs font-medium sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-sm"
            aria-label="Account"
          >
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-white/20 bg-white/5 px-3 py-2 font-semibold text-white hover:bg-white/10 sm:min-h-0 sm:px-3 sm:py-1.5"
              href="/login"
            >
              Sign In
            </Link>
          </nav>
        ) : null}
      </div>
    </>
  );
}
