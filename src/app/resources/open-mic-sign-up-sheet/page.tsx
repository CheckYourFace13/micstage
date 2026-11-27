import Link from "next/link";
import type { Metadata } from "next";
import { absoluteUrl, buildPublicMetadata } from "@/lib/publicSeo";

const PDF_HREF = "/downloads/micstage-open-mic-sign-up-sheet.pdf";

export const metadata: Metadata = buildPublicMetadata({
  title: "Free open mic sign-up sheet (printable PDF)",
  description:
    "Download a free printable open mic sign-up sheet PDF — signup order, stage name, set length, and notes — or replace the clipboard with MicStage’s free online signup tools. No registration required for the download.",
  path: "/resources/open-mic-sign-up-sheet",
});

export default function OpenMicSignUpSheetPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resources", item: absoluteUrl("/resources") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Open mic sign-up sheet",
        item: absoluteUrl("/resources/open-mic-sign-up-sheet"),
      },
    ],
  };

  const digitalDocumentLd = {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: "MicStage open mic sign-up sheet",
    description:
      "Free printable open mic sign-up sheet with performer/stage name, signup order, set length, and notes columns.",
    url: absoluteUrl(PDF_HREF),
    encodingFormat: "application/pdf",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "MicStage", url: absoluteUrl("/") },
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(digitalDocumentLd) }} />

        <div className="text-xs text-white/60">
          <Link href="/resources" className="underline hover:text-white">
            Resources
          </Link>
          {" | "}
          Free download
        </div>

        <h1 className="om-heading mt-3 text-4xl tracking-wide">Free open mic sign-up sheet</h1>
        <p className="mt-3 text-base text-white/80">
          A clean, printable list for hosts who still want paper at the door — and a clear path to replace that clipboard
          with MicStage’s free online signup when you are ready.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={PDF_HREF}
            download="micstage-open-mic-sign-up-sheet.pdf"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
          >
            Download PDF (free)
          </a>
          <Link
            href="/host"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Host online signup free
          </Link>
        </div>
        <p className="mt-3 text-xs text-white/55">
          No account required to download. Letter size. No ads or affiliate links on the sheet.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">What is on the sheet</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-white/80">
            <li>Signup order (#)</li>
            <li>Performer / stage name</li>
            <li>Set length</li>
            <li>Notes (first timer, DI needed, duo, early leave, and similar host cues)</li>
            <li>Header fields for venue, date, night/format, host, default set length, and signup close time</li>
            <li>Tasteful MicStage branding and micstage.com — nothing else</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">How to use the paper list</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/80">
            <p>
              Print one copy, put a pen on a string, and announce when the list opens and closes. One sheet and one host
              keep the night fair. If someone is hard to read, rewrite the name before you announce the order — illegible
              lists cause skipped slots.
            </p>
            <p>
              Use the notes column for logistics only. Do not write phone numbers or private contact details on a public
              clipboard.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold">How MicStage replaces the paper sheet</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/80">
            <p>
              MicStage’s free online signup tools do the same job as a clipboard, without the lost pen or the second
              competing list:
            </p>
            <ul className="list-inside list-disc space-y-2">
              <li>Claim or list your venue and publish the open mic night on a public page performers can trust.</li>
              <li>Open bookable slots with clear set length and capacity so people reserve before they leave home.</li>
              <li>See the running order as host without retyping names from a crumpled sheet.</li>
              <li>Keep a short printed backup for walk-ins if you want — MicStage stays the authoritative list.</li>
            </ul>
            <p>
              Start at{" "}
              <Link href="/host" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
                micstage.com/host
              </Link>
              , or register a venue at{" "}
              <Link href="/register/venue" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
                /register/venue
              </Link>
              . Performers looking for a night can browse{" "}
              <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
                find open mics
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Related guides</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <li>
              <Link
                href="/resources/how-to-run-a-successful-open-mic-night"
                className="text-sm text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 hover:brightness-110"
              >
                How to run a successful open mic night
              </Link>
            </li>
            <li>
              <Link
                href="/resources/what-to-expect-at-your-first-open-mic"
                className="text-sm text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 hover:brightness-110"
              >
                What to expect at your first open mic
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
