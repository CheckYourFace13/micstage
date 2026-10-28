"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Shows booking/cancel success after redirect. Props come from server searchParams so the message survives
 * client-side URL cleanup (e.g. analytics stripping query flags).
 */
export function VenueBookingFlash({
  initialBooked,
  initialCancelled,
  isMusician = false,
  guestEmail = "",
  guestName = "",
  returnPath = "",
}: {
  initialBooked: boolean;
  initialCancelled: boolean;
  isMusician?: boolean;
  guestEmail?: string;
  guestName?: string;
  returnPath?: string;
}) {
  const [booked] = useState(initialBooked);
  const [cancelled] = useState(initialCancelled);

  if (cancelled) {
    return (
      <div className="mt-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
        Booking cancelled. The slot is available again for others.
      </div>
    );
  }

  if (!booked) return null;

  const registerQs = new URLSearchParams();
  if (guestEmail) registerQs.set("email", guestEmail);
  if (guestName) registerQs.set("stageName", guestName);
  if (returnPath) registerQs.set("next", returnPath);
  const registerHref = `/register/musician${registerQs.toString() ? `?${registerQs.toString()}` : ""}`;

  if (!isMusician) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-4 text-sm text-white">
        <p className="font-semibold">Signup confirmed.</p>
        <p className="mt-1 text-white/80">
          Your spot is saved. One more click makes a free performer account so you can find open mics near you.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={registerHref}
            className="inline-flex h-11 items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-4 text-sm font-semibold text-black hover:brightness-110"
          >
            Finish free account
          </Link>
          <Link
            href="/find-open-mics"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Find open mics near you — free
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-4 text-sm text-white">
      <p className="font-semibold">Signup confirmed.</p>
      <p className="mt-1 text-white/80">You can manage it from your artist account.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/find-open-mics"
          className="inline-flex h-11 items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50 hover:bg-violet-500/25"
        >
          Find another mic nearby
        </Link>
        <Link
          href="/artist#weekly-alerts"
          className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          Weekly nearby-mic alerts
        </Link>
        <Link href="/artist" className="inline-flex h-11 items-center justify-center px-3 text-sm text-white/70 underline hover:text-white">
          Save performer profile
        </Link>
      </div>
    </div>
  );
}
