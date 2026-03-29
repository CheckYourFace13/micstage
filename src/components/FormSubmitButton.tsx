"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

/** Must be rendered inside the same <form> that triggers the submission. */
export function FormSubmitButton({ label, pendingLabel = "Working…", className, disabled }: Props) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button type="submit" disabled={isDisabled} className={className} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
