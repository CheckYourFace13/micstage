import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/publicSeo";

const BRAND_IMAGE_CANDIDATES = [
  { publicPath: "/brand/logo-primary.png", label: "Primary logo" },
  { publicPath: "/brand/logo-light.png", label: "Light logo" },
  { publicPath: "/brand/logo-dark.png", label: "Dark logo" },
  { publicPath: "/brand/icon.png", label: "App icon" },
  { publicPath: "/brand/icon-mark.png", label: "Icon mark" },
  { publicPath: "/favicon.png", label: "Current favicon / starter mark" },
] as const;

function getExistingBrandAssets(): { publicPath: string; label: string }[] {
  const root = process.cwd();
  return BRAND_IMAGE_CANDIDATES.filter((asset) => {
    const file = path.join(root, "public", asset.publicPath.replace(/^\//, ""));
    return fs.existsSync(file);
  });
}

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage Brand Images | Logos, icon, and usage notes",
  description:
    "MicStage brand assets page with logo and icon references, brand usage notes, and media guidelines for open mic venues, partners, and press coverage.",
  path: "/media/brand-images",
});

export default function MediaBrandImagesPage() {
  const existingAssets = getExistingBrandAssets();

  return (
    <div className="min-h-dvh bg-black text-white print:bg-white print:text-black">
      <style>{`
        @media print {
          header, footer { display: none !important; }
        }
      `}</style>
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 print:max-w-none print:px-0">
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-white/70 print:hidden">
          <Link href="/media" className="underline decoration-white/25 underline-offset-2 hover:text-white">
            Media
          </Link>
          <span>·</span>
          <span>Brand Images</span>
          <Link
            href="/media/brand-images#downloads"
            className="ml-auto rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
          >
            Download
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgb(var(--om-neon))] print:text-black">Brand Assets</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">MicStage Brand Images</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 print:text-black">
            This page provides a clean reference for MicStage logos, icon usage, and brand notes for press coverage, partner
            decks, and venue communications related to the MicStage open mic platform.
          </p>

          <section className="mt-7">
            <h2 className="text-xl font-semibold">Logo area</h2>
            {existingAssets.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {existingAssets.map((asset) => (
                  <figure key={asset.publicPath} className="rounded-xl border border-white/10 bg-black/30 p-4 print:border-black/25 print:bg-white">
                    <div className="rounded-lg border border-dashed border-white/20 bg-black/20 p-4 print:border-black/25 print:bg-white">
                      <Image
                        src={asset.publicPath}
                        alt={`${asset.label} for MicStage`}
                        width={260}
                        height={110}
                        className="h-auto max-h-28 w-auto object-contain"
                      />
                    </div>
                    <figcaption className="mt-3 text-sm text-white/75 print:text-black">{asset.label}</figcaption>
                    <div className="mt-1 text-xs text-white/50 print:text-black/70">{asset.publicPath}</div>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/75 print:text-black">
                No dedicated logo files were detected in `public/brand` yet. Drop approved logo files there (PNG/SVG/WebP) and
                this page will surface them automatically.
              </p>
            )}
          </section>

          <section id="downloads" className="mt-8 scroll-mt-24 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 print:border-black/25">
            <h2 className="text-xl font-semibold">Downloads</h2>
            <p className="mt-2 text-sm leading-7 text-white/75 print:text-black">
              Use the links below to download files directly. Add additional approved assets under <code className="rounded bg-black/40 px-1 py-0.5 text-xs print:bg-zinc-200">public/brand/</code>{" "}
              to have them appear automatically on this page.
            </p>
            {existingAssets.length > 0 ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {existingAssets.map((asset) => (
                  <li key={`dl-${asset.publicPath}`}>
                    <a
                      href={asset.publicPath}
                      download
                      className="font-medium text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 hover:brightness-110"
                    >
                      Download — {asset.label}
                    </a>
                    <span className="ml-2 text-white/50 print:text-black/60">({asset.publicPath})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-white/65 print:text-black">
                No downloadable files detected yet. Add assets under <code className="rounded bg-black/40 px-1 py-0.5 text-xs print:bg-zinc-200">public/brand/</code> or include{" "}
                <code className="rounded bg-black/40 px-1 py-0.5 text-xs print:bg-zinc-200">public/favicon.png</code>.
              </p>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Icon area</h2>
            <p className="mt-2 text-sm leading-7 text-white/80 print:text-black">
              Use the MicStage icon for app shortcuts, social avatars, and compact partner references. Keep the icon clear,
              avoid distortion, and preserve visual contrast in dark and light contexts.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Brand usage notes</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-white/80 print:text-black">
              <li>Keep the MicStage name and mark legible; do not stretch, recolor, or add visual effects.</li>
              <li>Leave clear space around logos equal to at least the height of the “M” in MicStage.</li>
              <li>Use dark-mode logo variants on light backgrounds and light variants on dark backgrounds.</li>
              <li>When referencing MicStage in copy, use “MicStage” consistently as a proper noun.</li>
              <li>For press use, include a direct link to https://micstage.com and the Media page source path when possible.</li>
            </ul>
          </section>

          <section className="mt-8 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">Short brand description</h2>
            <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
              MicStage is an open mic platform that helps open mic venues publish structured schedules, helps performers find open
              mics and book slots, and helps audiences discover local talent and recurring live events. The brand represents
              clarity, creative opportunity, and practical tools for the local performance ecosystem.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
