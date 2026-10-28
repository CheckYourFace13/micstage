"use client";

import { useCallback, useMemo, useState } from "react";
import QRCode from "react-qr-code";

function withShareRef(url: string): string {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://micstage.com");
    if (!u.searchParams.get("ref")) u.searchParams.set("ref", "share");
    return u.toString();
  } catch {
    return url;
  }
}

export function ShareLinks(props: {
  url: string;
  title: string;
  className?: string;
  signupUrl?: string | null;
  nextMicUrl?: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const shareUrl = useMemo(() => withShareRef(props.url), [props.url]);
  const signupUrl = useMemo(
    () => (props.signupUrl ? withShareRef(props.signupUrl) : shareUrl),
    [props.signupUrl, shareUrl],
  );
  const nextMicUrl = useMemo(
    () => (props.nextMicUrl ? withShareRef(props.nextMicUrl) : null),
    [props.nextMicUrl],
  );
  const encoded = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(props.title);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2000);
  }, []);

  const copy = useCallback(
    async (url: string, label: string) => {
      try {
        await navigator.clipboard.writeText(url);
        flash(label);
      } catch {
        flash("Copy failed — select the link");
      }
    },
    [flash],
  );

  const nativeShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: props.title, url: shareUrl });
        return;
      } catch {
        /* dismissed */
      }
    }
    await copy(shareUrl, "Link copied");
  }, [copy, props.title, shareUrl]);

  return (
    <div className={props.className ?? "flex flex-wrap items-center gap-2 text-xs"}>
      <button
        type="button"
        data-track-event="host_share_copy"
        onClick={() => void copy(signupUrl, "Signup link copied")}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Copy signup link
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        data-track-event="host_share_facebook"
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Facebook
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        data-track-event="host_share_x"
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        X
      </a>
      <button
        type="button"
        data-track-event="host_share_native"
        onClick={() => void nativeShare()}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        Share
      </button>
      {nextMicUrl ? (
        <button
          type="button"
          data-track-event="host_share_next_mic"
          onClick={() => void copy(nextMicUrl, "Next open mic link copied")}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
        >
          Share next open mic
        </button>
      ) : null}
      <button
        type="button"
        data-track-event="host_share_qr"
        onClick={() => setShowQr((v) => !v)}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 hover:bg-white/10"
      >
        {showQr ? "Hide QR" : "QR code"}
      </button>
      {notice ? <span className="text-emerald-300/90">{notice}</span> : null}
      {showQr ? (
        <div className="mt-1 w-full basis-full">
          <div className="w-fit rounded-xl border border-white/15 bg-white p-3">
            <QRCode value={signupUrl} size={128} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
