"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { lineupPrimaryActionClass } from "@/components/venue/lineupActionStyles";
import { sendReplyAction } from "../actions";

export function MessageReplyForm({ threadId }: { threadId: string }) {
  return (
    <form action={sendReplyAction} className="mt-6 grid gap-3 border-t border-white/10 pt-6">
      <input type="hidden" name="threadId" value={threadId} />
      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Reply</span>
        <textarea
          name="body"
          required
          rows={4}
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/40"
          placeholder="Write your reply…"
        />
      </label>
      <FormSubmitButton label="Send reply" pendingLabel="Sending…" className={lineupPrimaryActionClass} />
    </form>
  );
}
