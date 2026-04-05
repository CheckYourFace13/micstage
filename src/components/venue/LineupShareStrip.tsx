"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";

type Props = {
  lineupUrl: string;
  embedUrl: string;
  apiUrl: string;
  publicVenuePath: string;
};

export function LineupShareStrip({ lineupUrl, embedUrl, apiUrl, publicVenuePath }: Props) {
  const [notice, setNotice] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2400);
  }, []);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`Copied ${label}`);
      } catch {
        flash("Couldn’t copy — try “Show raw URLs” below");
      }
    },
    [flash],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-white/90">Share this lineup</div>
        <p className="text-[11px] text-white/45">
          Provided by{" "}
          <Link href="/" className="text-white/60 underline hover:text-white">
            MicStage
          </Link>
        </p>
      </div>
      {notice ? <p className="mt-2 text-sm text-emerald-300/95">{notice}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => copy(lineupUrl, "lineup link")} className={lineupPrimaryActionClass}>
          Copy lineup link
        </button>
        <button type="button" onClick={() => copy(embedUrl, "embed link")} className={lineupSecondaryActionClass}>
          Copy embed link
        </button>
        <button type="button" onClick={() => copy(apiUrl, "API link")} className={lineupSecondaryActionClass}>
          Copy API link
        </button>
        <a href={lineupUrl} target="_blank" rel="noopener noreferrer" className={lineupSecondaryActionClass}>
          Open public lineup
        </a>
        <a href={embedUrl} target="_blank" rel="noopener noreferrer" className={lineupSecondaryActionClass}>
          Open embed view
        </a>
        <Link href={publicVenuePath} className={lineupSecondaryActionClass}>
          Venue page
        </Link>
      </div>
      <details className="mt-4 rounded-lg border border-white/10 bg-black/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-white/55 marker:content-none [&::-webkit-details-marker]:hidden hover:text-white/75">
          Show raw URLs
        </summary>
        <div className="space-y-2 border-t border-white/10 px-3 py-3 text-[11px] leading-relaxed text-white/50">
          <div>
            <span className="font-medium text-white/60">Lineup</span>
            <p className="mt-0.5 break-all font-mono">{lineupUrl}</p>
          </div>
          <div>
            <span className="font-medium text-white/60">Embed</span>
            <p className="mt-0.5 break-all font-mono">{embedUrl}</p>
          </div>
          <div>
            <span className="font-medium text-white/60">API</span>
            <p className="mt-0.5 break-all font-mono">{apiUrl}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
