import Link from "next/link";
import { ADMIN_LOGOUT_PATH } from "@/lib/adminEdge";
import { getAuthUiState } from "@/lib/authUiState";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";
import { VenueChangeRequestForm } from "@/app/venue/VenueChangeRequestForm";

function roleBadgeLink(text: string, tone: "admin", href: string) {
  const cls = "border-amber-400/40 bg-amber-500/15 text-amber-100";
  return (
    <Link
      href={href}
      className={`inline-flex max-w-[min(100%,18rem)] items-center truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:brightness-110 sm:max-w-xs sm:text-[11px] ${cls}`}
    >
      {text}
    </Link>
  );
}

export async function SiteHeader() {
  const { role: auth, signedInLine, signedInHref, venueSessionEmail } = await getAuthUiState();

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <Link
          href="/"
          className="group flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3 lg:flex-1"
        >
          <span className="flex shrink-0 items-center gap-2">
            <span className="om-heading text-xl tracking-wide text-white sm:text-2xl">MicStage</span>
            <span
              className="rounded border border-[rgba(var(--om-neon),0.4)] bg-[rgba(var(--om-neon),0.1)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--om-neon))] sm:text-[10px]"
              title="MicStage is in beta"
            >
              BETA
            </span>
          </span>
          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 sm:text-[11px]">
            Find open mics · Artists · Venues
          </span>
        </Link>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {auth === "admin" ? (
              <>
                {roleBadgeLink("ADMIN", "admin", "/internal/admin")}
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
            {auth === "venue" && signedInLine && signedInHref ? (
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
            {auth === "artist" && signedInLine && signedInHref ? (
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
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6 sm:gap-y-2">
            <nav
              className="flex flex-wrap items-center justify-end gap-x-1 gap-y-2 text-xs font-medium sm:text-sm"
              aria-label="Discover"
            >
              <Link
                className="rounded-md px-2 py-1.5 font-semibold text-[rgb(var(--om-neon))] hover:bg-white/10 hover:brightness-110 sm:px-3"
                href="/find-open-mics"
              >
                Find Local Open Mic&apos;s
              </Link>
              <Link
                className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                href="/performers"
              >
                Find Artists
              </Link>
              <Link
                className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                href="/locations"
              >
                By area
              </Link>
            </nav>
            {auth === "public" ? (
              <nav
                className="flex flex-wrap items-center justify-end gap-x-1 gap-y-2 border-t border-white/10 pt-2 text-xs font-medium sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-sm"
                aria-label="Account"
              >
                <Link
                  className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                  href="/login/musician"
                >
                  Artist login
                </Link>
                <Link
                  className="rounded-md border border-white/20 bg-white/5 px-2 py-1.5 text-white hover:bg-white/10 sm:px-3"
                  href="/login/venue"
                >
                  Venue login
                </Link>
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
