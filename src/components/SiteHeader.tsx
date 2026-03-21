import Link from "next/link";

/** Sticky MicStage branding + primary discovery links (every page). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4">
        <Link href="/" className="group flex min-w-0 flex-1 items-baseline gap-2 sm:gap-3">
          <span className="om-heading shrink-0 text-xl tracking-wide text-white sm:text-2xl">MicStage</span>
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 sm:text-[11px]">
            Artists to Music to Marketing
          </span>
        </Link>
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
    </header>
  );
}
