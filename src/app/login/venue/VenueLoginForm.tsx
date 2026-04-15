"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex h-11 min-w-[120px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
      aria-busy={pending}
    >
      {pending ? "Signing in…" : "Log in"}
    </button>
  );
}

type Props = {
  action: string;
  next: string;
  children: ReactNode;
  footer: ReactNode;
};

export function VenueLoginForm({ action, next, children, footer }: Props) {
  return (
    <form method="post" action={action} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
      <input type="hidden" name="next" value={next} />
      {children}
      <SubmitButton />
      {footer}
    </form>
  );
}
