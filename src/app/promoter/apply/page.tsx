import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Promoter application",
  description:
    "Apply to run promoter-led open mic nights on MicStage. Applications are manually reviewed before promoter access is approved.",
  path: "/promoter/apply",
});

export default async function PromoterApplyPage(props: {
  searchParams: Promise<{ ok?: string; error?: string; review?: string }>;
}) {
  const sp = await props.searchParams;
  const submitted = sp.ok === "1";
  const review = sp.review;
  const error = sp.error;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-white/55">Promoter access</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Apply as a promoter</h1>
        <p className="mt-3 text-sm text-white/70">
          This role is for organizers who run open mic nights across multiple venues. Every application is manually
          reviewed before access is granted.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-white/90">
            Application received. You will get an email update after review.
          </div>
        ) : null}
        {review === "approved" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-white/90">
            Application approved. Check your email for next steps.
          </div>
        ) : null}
        {review === "rejected" ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-white/90">
            Application reviewed. Check your email for details.
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white/90">
            {error === "rate"
              ? "Too many submissions from this email. Please wait and try again later."
              : error === "invalid"
                ? "Please complete all required fields and use a valid email."
                : error === "review"
                  ? "That review link is invalid, expired, or already used."
                  : "We could not submit your application right now. Please try again."}
          </div>
        ) : null}

        <form method="post" action="/promoter/apply/submit" className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">Your name</span>
            <input
              name="contactName"
              required
              maxLength={140}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Your full name"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">Email</span>
            <input
              name="email"
              type="email"
              required
              maxLength={190}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="you@example.com"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">City / region</span>
            <input
              name="cityRegion"
              maxLength={140}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Chicago, IL"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">Event brand or series name</span>
            <input
              name="brandName"
              maxLength={180}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="Example: Monday Night Open Mic"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">Social/profile URL</span>
            <input
              name="socialUrl"
              type="url"
              maxLength={300}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
              placeholder="https://instagram.com/yourpage"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-white/85">Notes</span>
            <textarea
              name="notes"
              rows={5}
              maxLength={3000}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
              placeholder="Tell us what nights you run, how often, and which venues you partner with."
            />
          </label>

          <button
            type="submit"
            className="mt-1 inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110"
          >
            Submit application
          </button>
        </form>

        <p className="mt-5 text-xs text-white/55">
          Need to share more context?{" "}
          <Link href="/contact" className="underline hover:text-white">
            Contact MicStage
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
