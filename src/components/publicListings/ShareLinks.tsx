"use client";

import { useCallback, useState } from "react";
import QRCode from "react-qr-code";

export function ShareLinks(props: { url: string; title: string; className?: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const encoded = encodeURIComponent(props.url);
  const encodedTitle = encodeURIComponent(props.title);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2000);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      flash("Link copied");
    } catch {
      flash("Copy failed — select the link");
    }
  }, [flash, props.url]);

  const nativeShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: props.title, url: props.url });
        return;
      } catch {
        /* dismissed */
      }
    }
    await copy();
  }, [copy, props.title, props.url]);

  return (
    <div className={props.className ?? "flex flex-wrap items-center gap-2 text-xs"}>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Copy link
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Facebook
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        X
      </a>
      <button
        type="button"
        onClick={() => void nativeShare()}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Share
      </button>
      <button
        type="button"
        onClick={() => setShowQr((v) => !v)}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        {showQr ? "Hide QR" : "QR code"}
      </button>
      {notice ? <span className="text-emerald-300/90">{notice}</span> : null}
      {showQr ? (
        <div className="mt-1 w-full basis-full">
          <div className="w-fit rounded-xl border border-white/15 bg-white p-3">
            <QRCode value={props.url} size={128} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
