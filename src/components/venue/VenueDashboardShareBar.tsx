"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";

type Props = {
  lineupUrl: string;
  embedUrl: string;
  publicVenueUrl: string;
  jsonUrl: string;
};

export function VenueDashboardShareBar({ lineupUrl, embedUrl, publicVenueUrl, jsonUrl }: Props) {
  const [notice, setNotice] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2200);
  }, []);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`Copied ${label}`);
      } catch {
        flash("Could not copy — open “Show raw URLs” below");
      }
    },
    [flash],
  );

  return (
    <div className="space-y-3">
      {notice ? <p className="text-sm text-emerald-300/95">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(lineupUrl, "lineup link")}
          className={lineupPrimaryActionClass}
        >
          Copy lineup link
        </button>
        <button
          type="button"
          onClick={() => copy(embedUrl, "embed link")}
          className={lineupSecondaryActionClass}
        >
          Copy embed link
        </button>
        <button
          type="button"
          onClick={() => copy(jsonUrl, "API link")}
          className={lineupSecondaryActionClass}
        >
          Copy API link
        </button>
        <a
          href={lineupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={lineupSecondaryActionClass}
        >
          Open public lineup
        </a>
        <a href={embedUrl} target="_blank" rel="noopener noreferrer" className={lineupSecondaryActionClass}>
          Open embed view
        </a>
        <Link href={publicVenueUrl} target="_blank" rel="noopener noreferrer" className={lineupSecondaryActionClass}>
          Full venue page
        </Link>
      </div>
      <details className="rounded-lg border border-white/10 bg-black/25">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-white/50 marker:content-none [&::-webkit-details-marker]:hidden hover:text-white/70">
          Show raw URLs
        </summary>
        <div className="space-y-2 border-t border-white/10 px-3 py-3 text-[11px] leading-relaxed text-white/45">
          <div>
            <span className="font-medium text-white/55">Lineup</span>
            <p className="mt-0.5 break-all font-mono">{lineupUrl}</p>
          </div>
          <div>
            <span className="font-medium text-white/55">Embed</span>
            <p className="mt-0.5 break-all font-mono">{embedUrl}</p>
          </div>
          <div>
            <span className="font-medium text-white/55">API</span>
            <p className="mt-0.5 break-all font-mono">{jsonUrl}</p>
          </div>
        </div>
      </details>
      <p className="text-xs text-white/45">
        Lineup and embed links are read-only for the public — safe to post on your site or socials.
      </p>
    </div>
  );
}
