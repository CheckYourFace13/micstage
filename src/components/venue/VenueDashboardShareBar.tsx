"use client";

import { useCallback, useState } from "react";

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
        flash("Could not copy — select the link manually");
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
          className="inline-flex h-11 items-center justify-center rounded-lg bg-[rgb(var(--om-neon))] px-4 text-sm font-bold text-black hover:brightness-110"
        >
          Copy lineup link
        </button>
        <button
          type="button"
          onClick={() => copy(embedUrl, "embed link")}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
        >
          Copy embed link
        </button>
        <a
          href={lineupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          Open public lineup
        </a>
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          Open embed view
        </a>
        <a
          href={publicVenueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 bg-transparent px-4 text-sm font-medium text-white/75 underline-offset-4 hover:text-white"
        >
          Full venue page
        </a>
        <button
          type="button"
          onClick={() => copy(jsonUrl, "JSON API URL")}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 px-4 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
        >
          Copy API URL
        </button>
      </div>
      <p className="text-xs text-white/45">
        Lineup and embed links are read-only for the public — safe to post on your site or socials.
      </p>
    </div>
  );
}
