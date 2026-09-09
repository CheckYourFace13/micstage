"use client";

import { useCallback, useState } from "react";
import QRCode from "react-qr-code";

/** Simple copy + native share + QR for a public MicStage page URL. */
export function SharePageButtons(props: { url: string; label?: string; className?: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const label = props.label ?? "your page";

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2200);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      flash("Link copied — ready to share.");
    } catch {
      flash("Could not copy. Select the link manually.");
    }
  }, [flash, props.url]);

  const share = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "MicStage open mic", url: props.url });
        flash("Share sheet opened.");
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await copy();
  }, [copy, flash, props.url]);

  return (
    <div className={props.className ?? "grid gap-2"}>
      {notice ? <p className="text-sm text-emerald-300/95">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50 hover:bg-violet-500/25"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          Share
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          {showQr ? "Hide QR" : "QR code"}
        </button>
      </div>
      {showQr ? (
        <div className="mt-1 w-fit rounded-xl border border-white/15 bg-white p-3">
          <QRCode value={props.url} size={148} />
        </div>
      ) : null}
      <p className="break-all text-xs text-white/45">
        {label}: {props.url}
      </p>
    </div>
  );
}
