import Link from "next/link";
import { SiteHeaderAuthClient } from "@/components/SiteHeaderAuthClient";

/**
 * Cacheable public header shell. Auth-specific chrome hydrates client-side
 * via `/api/public/auth-ui` so anonymous HTML can use shared CDN / ISR.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-black/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <Link
          href="/"
          className="group flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3 lg:flex-1"
        >
          <span className="flex shrink-0 items-center gap-2">
            <span className="om-heading text-xl tracking-wide text-white sm:text-2xl">MicStage</span>
          </span>
          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 sm:text-[11px]">
            Open mics near you
          </span>
        </Link>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <SiteHeaderAuthClient />
        </div>
      </div>
    </header>
  );
}
