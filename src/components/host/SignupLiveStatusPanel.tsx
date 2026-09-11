import Link from "next/link";
import { SharePageButtons } from "@/components/onboarding/SharePageButtons";
import type { SignupLiveStatus } from "@/lib/signupLiveStatus";
import { signupLiveAbsoluteUrl } from "@/lib/signupLiveStatus";

export function SignupLiveStatusPanel({
  status,
  manageHref,
}: {
  status: SignupLiveStatus;
  manageHref?: string;
}) {
  const abs = signupLiveAbsoluteUrl(status);
  const live = status.live;

  return (
    <div
      className={
        live
          ? "rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4"
          : "rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4"
      }
    >
      <p
        className={
          live
            ? "text-xs font-semibold uppercase tracking-widest text-emerald-200"
            : "text-xs font-semibold uppercase tracking-widest text-amber-100"
        }
      >
        {status.headline}
      </p>
      <p className="mt-2 text-sm text-white/85">{status.detail}</p>
      {!live && status.blockers.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
          {status.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {status.signupPath ? (
          <Link
            href={status.signupPath}
            className="inline-flex h-11 items-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black"
          >
            View signup page
          </Link>
        ) : null}
        {abs ? <SharePageButtons url={abs} label="Copy / QR" /> : null}
        {manageHref ? (
          <Link
            href={manageHref}
            className="inline-flex h-11 items-center rounded-md border border-white/25 px-4 text-sm font-semibold text-white"
          >
            Fix settings
          </Link>
        ) : null}
      </div>
      {live ? (
        <p className="mt-3 text-xs text-white/50">
          {status.filledSpots} booked · {status.openSpots} open · {status.totalSlots} total
        </p>
      ) : null}
    </div>
  );
}
