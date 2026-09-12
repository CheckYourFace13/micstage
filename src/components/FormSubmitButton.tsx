"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  /** When set, this submit posts the enclosing form to this action (e.g. upload slot) instead of the form `action`. */
  formAction?: string | ((formData: FormData) => void | Promise<void>);
};

/** Must be rendered inside the same <form> that triggers the submission. */
export function FormSubmitButton({
  label,
  pendingLabel = "Working…",
  className,
  disabled,
  formAction,
}: Props) {
  const { pending } = useFormStatus();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [nativePending, setNativePending] = useState(false);

  // Classic HTML form POST does not drive useFormStatus — disable after submit to prevent double-tap.
  useEffect(() => {
    const btn = btnRef.current;
    const form = btn?.form;
    if (!form || typeof formAction === "function") return;
    const onSubmit = () => setNativePending(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formAction]);

  const isDisabled = Boolean(disabled || pending || nativePending);
  return (
    <button
      ref={btnRef}
      type="submit"
      formAction={formAction}
      disabled={isDisabled}
      className={className}
      aria-busy={isDisabled}
    >
      {isDisabled ? pendingLabel : label}
    </button>
  );
}
