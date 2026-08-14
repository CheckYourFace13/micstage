import Link from "next/link";

/** Friendly public error — never expose stack traces, env vars, or ORM jargon. */
export function PublicDataUnavailable({
  title = "This page couldn’t load right now",
  description = "Please try again in a moment. You can still browse other pages on MicStage.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-lg px-6 py-16 text-center">
        <h1 className="om-heading text-3xl tracking-wide text-white">{title}</h1>
        <p className="mt-4 text-sm text-white/70">{description}</p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Home
          </Link>
          <Link
            href="/find-open-mics"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Find open mics
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Contact
          </Link>
        </div>
      </main>
    </div>
  );
}
