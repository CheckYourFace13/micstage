import fs from "node:fs";
import path from "node:path";

export type BrandKitPreviewSurface = "on-light" | "on-dark";

export type MediaBrandKitEntry = {
  file: string;
  displayName: string;
  previewSurface: BrandKitPreviewSurface;
};

/** Canonical MicStage brand kit files under `public/media/brand-images/`. */
export const MEDIA_BRAND_KIT: MediaBrandKitEntry[] = [
  {
    file: "micstage-logo-light-bg-horizontal-1.png",
    displayName: "Logo — light background, horizontal (icon left)",
    previewSurface: "on-dark",
  },
  {
    file: "micstage-logo-light-bg-horizontal-2.png",
    displayName: "Logo — light background, horizontal (variant)",
    previewSurface: "on-dark",
  },
  {
    file: "micstage-logo-horizontal-left-icon.png",
    displayName: "Logo — horizontal lockup (icon left, light-friendly)",
    previewSurface: "on-dark",
  },
  {
    file: "micstage-logo-black-bg-horizontal-1.png",
    displayName: "Logo — black background, horizontal (icon left)",
    previewSurface: "on-light",
  },
  {
    file: "micstage-logo-horizontal-right-icon.png",
    displayName: "Logo — horizontal lockup (icon right)",
    previewSurface: "on-light",
  },
  {
    file: "micstage-logo-stacked.png",
    displayName: "Logo — stacked (icon above wordmark)",
    previewSurface: "on-light",
  },
  {
    file: "micstage-logo-circle-icon-horizontal.png",
    displayName: "Logo — circular icon mark, horizontal layout",
    previewSurface: "on-light",
  },
  {
    file: "micstage-icon-pink-square.png",
    displayName: "App icon — pink mark on black (square)",
    previewSurface: "on-light",
  },
  {
    file: "micstage-wordmark.png",
    displayName: "Wordmark — white on black (horizontal)",
    previewSurface: "on-light",
  },
  {
    file: "micstage-wordmark-black.png",
    displayName: "Wordmark — dark on black (for light surfaces / design inversion)",
    previewSurface: "on-light",
  },
];

export function readPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 24) return null;
    const sig = buf.subarray(0, 8).toString("hex");
    if (sig !== "89504e470d0a1a0a") return null;
    // First chunk should be IHDR; width/height at bytes 16 and 20 after signature.
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

export function getBrandKitAssetDiskPath(file: string): string {
  return path.join(process.cwd(), "public", "media", "brand-images", file);
}

export function brandKitPublicPath(file: string): string {
  return `/media/brand-images/${file}`;
}
