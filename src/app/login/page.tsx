import Link from "next/link";

/** Unified sign-in hub — routes by account type without cluttering the header. */
export default function LoginHubPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="om-heading text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">Choose your MicStage account type.</p>
        <ul className="mt-8 grid gap-3">
          <li>
            <Link
              href="/login/musician"
              className="flex min-h-12 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] font-semibold text-black hover:brightness-110"
            >
              Artist / performer
            </Link>
          </li>
          <li>
            <Link
              href="/login/venue"
              className="flex min-h-12 items-center justify-center rounded-md border border-white/25 bg-white/8 font-semibold text-white hover:bg-white/12"
            >
              Venue / host
            </Link>
          </li>
          <li>
            <Link
              href="/login/promoter"
              className="flex min-h-12 items-center justify-center rounded-md border border-violet-400/30 bg-violet-500/10 font-semibold text-violet-100 hover:bg-violet-500/15"
            >
              Promoter
            </Link>
          </li>
        </ul>
        <p className="mt-8 text-center text-xs text-white/50">
          New here?{" "}
          <Link href="/register/musician" className="text-[rgb(var(--om-neon))] underline">
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
