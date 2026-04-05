"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  /** When set, this submit posts the enclosing form to this action (e.g. upload slot) instead of the form `action`. */
  formAction?: (formData: FormData) => void | Promise<void>;
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
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={isDisabled}
      className={className}
      aria-busy={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
