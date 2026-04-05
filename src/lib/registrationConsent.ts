/** Bump when signup copy or legal scope changes materially (stored with consent timestamp). */
export const REGISTRATION_CONTENT_CONSENT_VERSION = "2026-03-31-v1";

export const REGISTRATION_CONSENT_CHECKBOX_NAME = "registrationContentConsent";

/** Server-side: form must include this checkbox checked. */
export function registrationContentConsentChecked(formData: FormData): boolean {
  const v = formData.get(REGISTRATION_CONSENT_CHECKBOX_NAME);
  return v === "on" || v === "true" || v === "1";
}
