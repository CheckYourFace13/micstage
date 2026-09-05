import Link from "next/link";
import { REGISTRATION_CONSENT_CHECKBOX_NAME } from "@/lib/registrationConsent";

/**
 * Required on artist, host, and venue registration (not login).
 * Short UI copy; full Terms/Privacy remain linked. Server validation unchanged.
 */
export function RegistrationContentConsent() {
  return (
    <label className="flex cursor-pointer gap-3 text-sm leading-snug text-white/80">
      <input
        type="checkbox"
        name={REGISTRATION_CONSENT_CHECKBOX_NAME}
        value="true"
        required
        className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 accent-[rgb(var(--om-neon))]"
      />
      <span>
        I agree to the{" "}
        <Link href="/terms" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
          Terms
        </Link>
        ,{" "}
        <Link href="/privacy" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
          Privacy Policy
        </Link>
        , and MicStage&apos;s use of the profile content I choose to publish.
      </span>
    </label>
  );
}
