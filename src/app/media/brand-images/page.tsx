import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  MEDIA_BRAND_KIT,
  brandKitPublicPath,
  getBrandKitAssetDiskPath,
  readPngDimensions,
} from "@/lib/mediaBrandKit";
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

function previewShellClass(surface: "on-light" | "on-dark"): string {
  return surface === "on-light"
    ? "rounded-lg bg-zinc-100 p-4 ring-1 ring-black/10"
    : "rounded-lg bg-zinc-950 p-4 ring-1 ring-white/15";
}

export const metadata: Metadata = buildPublicMetadata({
  title: "MicStage Brand Images | Logos, icon, and usage notes",
  description:
    "MicStage brand assets page with logo and icon references, brand usage notes, and media guidelines for open mic venues, partners, and press coverage.",
  path: "/media/brand-images",
});

export default function MediaBrandImagesPage() {
  const existingAssets = getExistingBrandAssets();

  const brandKitResolved = MEDIA_BRAND_KIT.map((entry) => {
    const diskPath = getBrandKitAssetDiskPath(entry.file);
    const publicPath = brandKitPublicPath(entry.file);
    const dims = fs.existsSync(diskPath) ? readPngDimensions(diskPath) : null;
    return { ...entry, diskPath, publicPath, dims };
  }).filter((row) => fs.existsSync(row.diskPath));

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

          <section id="downloads" className="mt-8 scroll-mt-24 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 print:border-black/25">
            <h2 className="text-xl font-semibold">Downloads</h2>
            <p className="mt-2 text-sm leading-7 text-white/75 print:text-black">
              Download official MicStage brand assets below. Previews use neutral backgrounds so light and dark marks stay easy
              to judge on screen; each download is the original file.
            </p>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-white/55 print:text-black">Official brand kit</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {brandKitResolved.map((asset) => {
                const maxW = asset.dims ? Math.min(asset.dims.width, 560) : 280;
                const ratio = asset.dims ? asset.dims.height / asset.dims.width : 0.35;
                const h = asset.dims ? Math.max(1, Math.round(maxW * ratio)) : 100;
                const meta =
                  asset.dims != null ? `PNG · ${asset.dims.width}×${asset.dims.height}px` : "PNG";

                return (
                  <div
                    key={asset.file}
                    className="flex flex-col rounded-xl border border-white/10 bg-black/25 p-4 print:border-black/25 print:bg-white"
                  >
                    <div className={`flex min-h-[9.5rem] items-center justify-center ${previewShellClass(asset.previewSurface)}`}>
                      <Image
                        src={asset.publicPath}
                        alt={asset.displayName}
                        width={maxW}
                        height={h}
                        className="h-auto max-h-36 w-auto max-w-full object-contain"
                      />
                    </div>
                    <div className="mt-3 text-sm font-medium text-white print:text-black">{asset.displayName}</div>
                    <div className="mt-1 text-[11px] text-white/40 print:text-black/55">{meta}</div>
                    <a
                      href={asset.publicPath}
                      download={asset.file}
                      className="mt-3 inline-flex w-fit rounded-md border border-[rgb(var(--om-neon))]/50 bg-[rgb(var(--om-neon))]/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--om-neon))] hover:brightness-110"
                    >
                      Download
                    </a>
                  </div>
                );
              })}
            </div>

            {existingAssets.length > 0 ? (
              <>
                <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-white/55 print:text-black">
                  Additional downloads
                </h3>
                <ul className="mt-3 grid gap-2 text-sm">
                  {existingAssets.map((asset) => (
                    <li key={`legacy-dl-${asset.publicPath}`}>
                      <a
                        href={asset.publicPath}
                        download
                        className="font-medium text-[rgb(var(--om-neon))] underline decoration-white/20 underline-offset-2 hover:brightness-110"
                      >
                        Download: {asset.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
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
              <li>For press use, include a direct link to https://micstage.com and to this Media section when helpful.</li>
            </ul>
          </section>

          <section className="mt-8 border-t border-white/15 pt-6 print:border-black/30">
            <h2 className="text-xl font-semibold">Short brand description</h2>
            <p className="mt-3 text-sm leading-7 text-white/80 print:text-black">
              MicStage is an open mic platform for venues that want a clean public schedule and for performers who want a straight
              path to book. These assets exist so press, partners, and rooms can reference the product without rebuilding logos
              from screenshots.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
