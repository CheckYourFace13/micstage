import Link from "next/link";
import { REGISTRATION_CONSENT_CHECKBOX_NAME } from "@/lib/registrationConsent";

/**
 * Required on artist and venue registration (not login). Links to legal pages; must match server validation.
 */
export function RegistrationContentConsent() {
  return (
    <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-white/80">
      <input
        type="checkbox"
        name={REGISTRATION_CONSENT_CHECKBOX_NAME}
        value="true"
        required
        className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 accent-[rgb(var(--om-neon))]"
      />
      <span>
        I have read and agree to the{" "}
        <Link href="/terms" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-[rgb(var(--om-neon))] underline hover:brightness-110">
          Privacy Policy
        </Link>
        . I grant MicStage permission to display and use the names, logos, likeness, images, music, and other profile or
        promotional materials I submit in connection with operating the platform and promoting MicStage, as described in
        those documents.
      </span>
    </label>
  );
}
