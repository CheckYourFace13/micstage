import type { Metadata } from "next";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { finalizeVenuePasswordReset } from "../actions";
import { verifyResetToken } from "@/lib/passwordReset";
import { privateNoIndexMetadata } from "@/lib/privateSeo";

export async function generateMetadata(_props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  return {
    title: "Set new venue password | MicStage",
    ...privateNoIndexMetadata,
  };
}

export default async function VenueResetTokenPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const valid = await verifyResetToken({ accountType: "VENUE", token });

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <a className="text-sm text-white/70 hover:text-white" href="/login/venue">
          ← Back to login
        </a>

        <h1 className="om-heading mt-6 text-4xl tracking-wide">Set new password</h1>
        {!valid ? (
          <div className="mt-6 rounded-xl border border-[rgba(var(--om-neon),0.35)] bg-[rgba(var(--om-neon),0.08)] px-4 py-3 text-sm text-white">
            This reset link is invalid or expired.
          </div>
        ) : (
          <form action={finalizeVenuePasswordReset} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <input type="hidden" name="token" value={token} />
            <label className="grid gap-1 text-sm">
              <span className="text-white/80">New password</span>
              <input
                name="newPassword"
                type="password"
                required
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-white placeholder:text-white/40"
                placeholder="New password"
              />
            </label>
            <FormSubmitButton
              label="Save new password"
              pendingLabel="Saving…"
              className="mt-2 inline-flex h-11 min-w-[180px] items-center justify-center rounded-md bg-[rgb(var(--om-neon))] px-5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-70"
            />
          </form>
        )}
      </main>
    </div>
  );
}

