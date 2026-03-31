import Link from "next/link";
import { adminLogoutAction } from "@/app/internal/admin/logoutAction";
import { getAuthUiState } from "@/lib/authUiState";
import { LogoutVenueArtistButton } from "@/components/LogoutVenueArtistButton";

function roleBadge(text: string, tone: "venue" | "artist" | "admin") {
  const cls =
    tone === "venue"
      ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
      : tone === "artist"
        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
        : "border-amber-400/40 bg-amber-500/15 text-amber-100";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${cls}`}
    >
      {text}
    </span>
  );
}

function roleBadgeLink(text: string, tone: "venue" | "artist" | "admin", href: string) {
  const cls =
    tone === "venue"
      ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
      : tone === "artist"
        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
        : "border-amber-400/40 bg-amber-500/15 text-amber-100";
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:brightness-110 sm:text-[11px] ${cls}`}
    >
      {text}
    </Link>
  );
}

export async function SiteHeader() {
  const { role: auth } = await getAuthUiState();

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <Link href="/" className="group flex min-w-0 items-baseline gap-2 sm:gap-3 lg:flex-1">
          <span className="om-heading shrink-0 text-xl tracking-wide text-white sm:text-2xl">MicStage</span>
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 sm:text-[11px]">
            Artists to Music to Marketing
          </span>
        </Link>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            {auth === "admin" ? (
              <>
                {roleBadgeLink("ADMIN", "admin", "/internal/admin")}
                <form action={adminLogoutAction} className="inline">
                  <button
                    type="submit"
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-amber-100/90 hover:bg-amber-500/15 hover:text-amber-50 sm:text-xs"
                  >
                    Sign out admin
                  </button>
                </form>
              </>
            ) : null}
            {auth === "venue" ? (
              <>
                {roleBadge("Venue", "venue")}
                <LogoutVenueArtistButton
                  label="Sign out"
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
                />
              </>
            ) : null}
            {auth === "artist" ? (
              <>
                {roleBadge("Artist", "artist")}
                <LogoutVenueArtistButton
                  label="Sign out"
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
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
                className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                href="/performers"
              >
                Find Artists
              </Link>
              <Link
                className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                href="/locations"
              >
                Find Venues
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
