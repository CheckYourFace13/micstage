import Link from "next/link";
import { ADMIN_PATH_PREFIX } from "@/lib/adminEdge";

const links: { href: string; label: string }[] = [
  { href: "/internal/admin", label: "Overview" },
  { href: "/internal/admin/venues", label: "Venues" },
  { href: "/internal/admin/accounts", label: "Venue accounts" },
  { href: "/internal/admin/artists", label: "Artists" },
  { href: "/internal/admin/bookings", label: "Bookings" },
  { href: "/internal/admin/templates", label: "Templates" },
  { href: "/internal/admin/events", label: "Instances" },
];

export function AdminNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-700 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-3 py-2 text-sm">
        <span className="mr-2 font-semibold text-zinc-100">MicStage admin</span>
        <nav className="flex flex-wrap gap-1" aria-label="Admin sections">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/internal/admin/logout"
          className="ml-auto rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Sign out
        </Link>
      </div>
      <p className="border-t border-zinc-800 px-3 py-1 text-[10px] text-zinc-500">
        Internal only — path <code className="text-zinc-400">{ADMIN_PATH_PREFIX}</code>
      </p>
    </header>
  );
}
