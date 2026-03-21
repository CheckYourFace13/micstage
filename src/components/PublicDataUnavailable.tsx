import Link from "next/link";

export function PublicDataUnavailable({
  title = "This page couldn’t load live data",
  description = "MicStage’s directory needs a database connection. You can still use the rest of the site.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-lg px-6 py-16 text-center">
        <h1 className="om-heading text-3xl tracking-wide text-white">{title}</h1>
        <p className="mt-4 text-sm text-white/70">{description}</p>
        <p className="mt-2 text-xs text-white/50">
          If you’re the site owner, confirm <code className="rounded bg-white/10 px-1">DATABASE_URL</code> is set for
          production.
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Home
          </Link>
          <Link
            href="/performers"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Performers
          </Link>
          <Link
            href="/locations"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Locations
          </Link>
        </div>
      </main>
    </div>
  );
}
