import Link from "next/link";
import { getSession } from "@/lib/session";
import { isAdminSessionCookieValid } from "@/lib/adminAuth";

function roleBadge(text: string, tone: "admin" | "venue" | "artist") {
  const cls =
    tone === "admin"
      ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
      : tone === "venue"
        ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
        : "border-emerald-400/35 bg-emerald-500/15 text-emerald-100";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${cls}`}
    >
      {text}
    </span>
  );
}

/** Sticky MicStage branding + primary discovery links (every page). */
export async function SiteHeader() {
  const [session, adminOk] = await Promise.all([getSession(), isAdminSessionCookieValid()]);

  const venueSession = session?.kind === "venue";
  const artistSession = session?.kind === "musician";

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4">
        <Link href="/" className="group flex min-w-0 flex-1 items-baseline gap-2 sm:gap-3">
          <span className="om-heading shrink-0 text-xl tracking-wide text-white sm:text-2xl">MicStage</span>
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 sm:text-[11px]">
            Artists to Music to Marketing
          </span>
        </Link>
        <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            {adminOk ? roleBadge("Admin", "admin") : null}
            {venueSession ? roleBadge("Venue", "venue") : null}
            {!venueSession && artistSession ? roleBadge("Artist", "artist") : null}
            {adminOk ? (
              <Link
                className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
                href="/internal/admin/logout"
              >
                Sign out admin
              </Link>
            ) : null}
            {venueSession || artistSession ? (
              <Link
                className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white sm:text-xs"
                href="/logout"
              >
                Sign out account
              </Link>
            ) : null}
          </div>
          <nav
            className="flex w-full flex-wrap items-center justify-end gap-x-1 gap-y-2 text-xs font-medium sm:w-auto sm:text-sm"
            aria-label="Primary"
          >
            <Link
              className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
              href="/performers"
            >
              Performers
            </Link>
            <Link
              className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
              href="/locations"
            >
              Open mic venues
            </Link>
            <Link
              className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
              href="/contact"
            >
              Contact
            </Link>
            {adminOk ? (
              <Link
                className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-amber-100 hover:bg-amber-500/20 sm:px-3"
                href="/internal/admin"
              >
                Admin
              </Link>
            ) : (
              <Link
                className="rounded-md px-2 py-1.5 text-white/75 hover:bg-white/10 hover:text-white sm:px-3"
                href="/internal/admin/login"
              >
                Admin login
              </Link>
            )}
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
        </div>
      </div>
    </header>
  );
}
