"use client";

import QRCode from "react-qr-code";
import type { MouseEvent } from "react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { isCanonicalVenueOpenMicPublicUrl } from "@/lib/venueOpenMicQrUrl";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";

type Props = {
  /** Server-built absolute URL from `absoluteUrl(\`/venues/${slug}\`)` — never user-controlled free text. */
  publicPageUrl: string;
  venueName: string;
  variant?: "public" | "dashboard";
  /** Optional note (e.g. when the venue has not published nights yet). */
  hint?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugFromVenueUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    const seg = path.split("/").filter(Boolean).pop();
    return seg && /^[a-z0-9-]+$/.test(seg) ? seg : "venue";
  } catch {
    return "venue";
  }
}

export function VenueOpenMicQrCode({ publicPageUrl, venueName, variant = "public", hint }: Props) {
  const urlOk = isCanonicalVenueOpenMicPublicUrl(publicPageUrl);
  const slug = useMemo(
    () => (urlOk ? slugFromVenueUrl(publicPageUrl) : "venue"),
    [publicPageUrl, urlOk],
  );

  const [notice, setNotice] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stableId = useId().replace(/:/g, "");
  const svgTitleId = `micstage-qr-title-${stableId}`;

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2400);
  }, []);

  const getSvgEl = (): SVGSVGElement | null => wrapRef.current?.querySelector("svg") ?? null;

  const downloadSvg = useCallback((e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!urlOk) return;
    const svg = getSvgEl();
    if (!svg) {
      flash("Could not build download");
      return;
    }
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `micstage-${slug}-open-mic-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("Downloaded SVG");
  }, [flash, slug, urlOk]);

  const downloadPng = useCallback(async (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!urlOk) return;
    const svg = getSvgEl();
    if (!svg) {
      flash("Could not build download");
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    const outSize = 512;
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        flash("Could not build PNG");
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outSize, outSize);
      ctx.drawImage(img, 0, 0, outSize, outSize);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            flash("Could not build PNG");
            return;
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `micstage-${slug}-open-mic-qr.png`;
          a.click();
          URL.revokeObjectURL(a.href);
          flash("Downloaded PNG");
        },
        "image/png",
        1,
      );
    } catch {
      URL.revokeObjectURL(url);
      flash("Could not build PNG");
    }
  }, [flash, slug, urlOk]);

  const copyLink = useCallback(async (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!urlOk) return;
    try {
      await navigator.clipboard.writeText(publicPageUrl);
      flash("Copied page link");
    } catch {
      flash("Could not copy — select the URL manually");
    }
  }, [flash, publicPageUrl, urlOk]);

  const printSheet = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!urlOk) return;

      console.log("[venue qr] print clicked");

      /** Must open synchronously in the click handler (popup rules). Do not use `noopener` here — it makes `window.open` return `null` in modern browsers, so we cannot call `document.write`. */
      const w = window.open("about:blank", "_blank");

      if (!w) {
        console.warn("[venue qr] print blocked");
        flash("Pop-up blocked — allow pop-ups for this site to print the poster.");
        return;
      }

      console.log("[venue qr] print window opened");

      const svg = getSvgEl();
      if (!svg) {
        try {
          w.close();
        } catch {
          /* ignore */
        }
        flash("Could not open print view");
        return;
      }

      const svgHtml = new XMLSerializer().serializeToString(svg);
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(venueName)} — MicStage QR</title>
<style>
  body { margin: 0; padding: 28px 20px; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; background: #fff; text-align: center; }
  .brand { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #555; margin-bottom: 10px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; line-height: 1.2; }
  .qr { display: inline-block; padding: 14px; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; }
  .qr svg { display: block; width: 220px; height: 220px; }
  p { margin: 18px auto 0; font-size: 14px; color: #444; max-width: 320px; line-height: 1.45; }
  .url { margin-top: 14px; font-size: 11px; color: #666; word-break: break-all; max-width: 420px; margin-left: auto; margin-right: auto; font-family: ui-monospace, monospace; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="brand">MicStage</div>
  <h1>${escapeHtml(venueName)}</h1>
  <div class="qr">${svgHtml}</div>
  <p>Scan to view or book this open mic on MicStage</p>
  <div class="url">${escapeHtml(publicPageUrl)}</div>
</body>
</html>`;

      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
        console.log("[venue qr] print html written");
        try {
          w.opener = null;
        } catch {
          /* ignore cross-origin restrictions */
        }
        w.focus();
        w.print();
      } catch (err) {
        console.error("[venue qr] print write failed", err);
        try {
          w.close();
        } catch {
          /* ignore */
        }
        flash("Could not prepare print view. Try again or use Download QR.");
      }
    },
    [flash, publicPageUrl, urlOk, venueName],
  );

  if (!urlOk) {
    return null;
  }

  const qrSize = variant === "public" ? 200 : 176;

  const shell =
    variant === "public"
      ? "rounded-2xl border border-white/15 bg-white/[0.06] p-4 sm:p-6"
      : "rounded-xl border border-white/12 bg-black/30 p-4 sm:p-5";

  return (
    <section className={shell} aria-labelledby={svgTitleId}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex shrink-0 justify-center sm:justify-start">
          <div
            ref={wrapRef}
            className="rounded-xl border border-black/10 bg-white p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          >
            <QRCode
              value={publicPageUrl}
              size={qrSize}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              title={`QR code: ${venueName} on MicStage`}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id={svgTitleId} className="text-sm font-semibold text-white sm:text-lg">
              Scan to view or book this open mic on MicStage
            </h2>
            <p className="mt-1 break-all text-[11px] leading-relaxed text-white/45 sm:text-sm sm:text-white/60">
              {publicPageUrl}
            </p>
            {hint ? (
              <p className="mt-2 text-xs leading-snug text-white/50 sm:text-sm sm:leading-relaxed sm:text-white/65">
                {hint}
              </p>
            ) : null}
          </div>
          {notice ? <p className="text-sm text-emerald-300/95">{notice}</p> : null}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-2">
            <button type="button" onClick={(ev) => void copyLink(ev)} className={lineupPrimaryActionClass}>
              Copy page link
            </button>
            <button type="button" onClick={(ev) => downloadSvg(ev)} className={lineupSecondaryActionClass}>
              Download QR (SVG)
            </button>
            <button type="button" onClick={(ev) => void downloadPng(ev)} className={lineupSecondaryActionClass}>
              Download QR (PNG)
            </button>
            <button type="button" onClick={printSheet} className={lineupSecondaryActionClass}>
              Print poster
            </button>
          </div>
          {variant === "dashboard" ? (
            <p className="text-xs leading-relaxed text-white/45">
              This QR always opens your public MicStage venue page ({publicPageUrl}). Use flyers, table tents, or bar signs —
              not a third-party link shortener.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
