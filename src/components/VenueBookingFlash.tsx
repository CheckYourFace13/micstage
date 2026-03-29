"use client";

import { useState } from "react";

/**
 * Shows booking/cancel success after redirect. Props come from server searchParams so the message survives
 * client-side URL cleanup (e.g. analytics stripping query flags).
 */
export function VenueBookingFlash({
  initialBooked,
  initialCancelled,
}: {
  initialBooked: boolean;
  initialCancelled: boolean;
}) {
  const [booked] = useState(initialBooked);
  const [cancelled] = useState(initialCancelled);

  if (booked) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-white">
        Reservation confirmed. You can manage it from your artist portal if you booked while signed in.
      </div>
    );
  }
  if (cancelled) {
    return (
      <div className="mt-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
        Booking cancelled. The slot is available again for others.
      </div>
    );
  }
  return null;
}
