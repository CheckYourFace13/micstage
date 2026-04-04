"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useVenuePortalRedirect } from "@/lib/venuePortalClient";
import { inviteManager } from "./actions";

export function VenueInviteManagerForm({ venueId }: { venueId: string }) {
  const go = useVenuePortalRedirect();
  return (
    <form action={async (fd) => go(await inviteManager(fd))} className="grid gap-3 md:grid-cols-3">
      <input type="hidden" name="venueId" value={venueId} />
      <label className="grid gap-1 text-sm md:col-span-2">
        <span className="text-white/80">Manager email</span>
        <input
          name="managerEmail"
          type="email"
          required
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="manager@venue.com"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Temp password</span>
        <input
          name="tempPassword"
          required
          className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
          placeholder="Temp password"
        />
      </label>
      <FormSubmitButton
        label="Add manager"
        pendingLabel="Saving…"
        className="h-11 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60 md:col-span-3"
      />
    </form>
  );
}
