"use client";

import { useActionState } from "react";
import { CONTACT_CATEGORIES } from "./categories";
import { submitContactForm, type ContactFormState } from "./actions";

const initial: ContactFormState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactForm, initial);

  if (state.status === "success") {
    return (
      <div
        className="rounded-2xl border border-emerald-500/35 bg-emerald-950/30 p-6 text-sm text-emerald-100"
        role="status"
      >
        <p className="font-semibold text-white">Message sent</p>
        <p className="mt-2 text-white/85">
          Thanks. We received your note and will reply by email when we can.
        </p>
        {state.devLogged ? (
          <p className="mt-3 text-xs text-white/60">
            Development: no Resend key or inbox configured, so your message was logged on the server console instead of being
            emailed.
          </p>
        ) : null}
        <p className="mt-4 text-sm">
          <a className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/contact">
            Send another message
          </a>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-6">
      {state.status === "error" && state.message ? (
        <p
          className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-white">Name</span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={200}
          disabled={pending}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:border-[rgb(var(--om-neon))] focus:outline-none disabled:opacity-50"
          aria-invalid={state.status === "error" && state.fieldErrors?.name ? true : undefined}
        />
        {state.status === "error" && state.fieldErrors?.name ? (
          <span className="text-xs text-red-300">{state.fieldErrors.name}</span>
        ) : null}
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-white">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:border-[rgb(var(--om-neon))] focus:outline-none disabled:opacity-50"
          aria-invalid={state.status === "error" && state.fieldErrors?.email ? true : undefined}
        />
        {state.status === "error" && state.fieldErrors?.email ? (
          <span className="text-xs text-red-300">{state.fieldErrors.email}</span>
        ) : null}
      </label>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium text-white">What is this about?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONTACT_CATEGORIES.map((c, i) => (
            <label
              key={c.value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[rgb(var(--om-neon))]"
            >
              <input
                type="radio"
                name="category"
                value={c.value}
                required={i === 0}
                disabled={pending}
                className="mt-1"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        {state.status === "error" && state.fieldErrors?.category ? (
          <span className="text-xs text-red-300">{state.fieldErrors.category}</span>
        ) : null}
      </fieldset>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-white">Details</span>
        <textarea
          name="details"
          required
          rows={6}
          maxLength={10_000}
          disabled={pending}
          placeholder="Include links, dates, or steps to reproduce if relevant."
          className="resize-y rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:border-[rgb(var(--om-neon))] focus:outline-none disabled:opacity-50"
          aria-invalid={state.status === "error" && state.fieldErrors?.details ? true : undefined}
        />
        {state.status === "error" && state.fieldErrors?.details ? (
          <span className="text-xs text-red-300">{state.fieldErrors.details}</span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-lg bg-[rgb(var(--om-neon))] px-6 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
