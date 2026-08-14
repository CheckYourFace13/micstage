import Link from "next/link";

/** Unified sign-in hub — routes by account type without cluttering the header. */
export default async function LoginHubPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextRaw } = await props.searchParams;
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw.trim() : "";
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const venueNext = next.startsWith("/claim/activate/") || next.startsWith("/venue");
  const promoterNext = next.startsWith("/promoter");

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="om-heading text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">Choose your MicStage account type.</p>
        <ul className="mt-8 grid gap-3">
          <li>
            <Link
              href={`/login/musician${q}`}
              className="flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] font-semibold text-black hover:brightness-110"
            >
              Artist / performer
            </Link>
          </li>
          <li>
            <Link
              href={`/login/venue${q}`}
              className={`flex min-h-12 items-center justify-center rounded-md border font-semibold ${
                venueNext
                  ? "border-violet-400/40 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30"
                  : "border-white/25 bg-white/8 text-white hover:bg-white/12"
              }`}
            >
              Venue / host
            </Link>
          </li>
          <li>
            <Link
              href={`/login/promoter${q}`}
              className={`flex min-h-12 items-center justify-center rounded-md border font-semibold ${
                promoterNext
                  ? "border-violet-400/40 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30"
                  : "border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15"
              }`}
            >
              Promoter
            </Link>
          </li>
        </ul>
        <p className="mt-8 text-center text-xs text-white/50">
          New here?{" "}
          <Link href={`/register/musician${q}`} className="text-[rgb(var(--om-neon))] underline">
            Create artist account
          </Link>
          {" · "}
          <Link href="/register/venue" className="underline hover:text-white">
            List your venue
          </Link>
        </p>
      </main>
    </div>
  );
}
