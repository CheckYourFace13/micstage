import Link from "next/link";
import type { SetupChecklistItem } from "@/lib/onboarding/setupProgress";
import { setupCompletionPct } from "@/lib/onboarding/setupProgress";

export function SetupChecklist(props: {
  heading: string;
  /** Lead with benefit — e.g. "3 quick things can help more performers find you." */
  subheading: string;
  items: SetupChecklistItem[];
  laterHref?: string;
}) {
  const pct = setupCompletionPct(props.items);
  const remaining = props.items.filter((i) => !i.done);
  const remainingCount = remaining.length;

  if (remaining.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">{props.heading}</h2>
        <p className="mt-1 text-sm text-white/75">You&apos;re all set for now. You can always edit details later.</p>
      </section>
    );
  }

  const benefitLead =
    remainingCount === 1
      ? "1 quick thing can help more performers find you."
      : `${remainingCount} quick things can help more performers find you.`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">{props.heading}</h2>
      <p className="mt-1 text-sm text-white/80">{benefitLead}</p>
      <p className="mt-1 text-xs text-white/55">{props.subheading}</p>
      <p className="mt-2 text-xs text-white/40">{pct}% done · optional</p>
      <ul className="mt-4 grid gap-3">
        {props.items.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl border px-3 py-3 ${
              item.done ? "border-emerald-400/25 bg-emerald-500/10 opacity-70" : "border-white/10 bg-black/25"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-white">
                  {item.done ? "✓ " : ""}
                  {item.title}
                </div>
                <p className="mt-1 text-xs text-white/55">{item.why}</p>
              </div>
              {!item.done ? (
                <Link
                  href={item.href}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Do this
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {props.laterHref ? (
        <p className="mt-4 text-center text-sm">
          <Link className="text-white/60 underline hover:text-white" href={props.laterHref}>
            I&apos;ll do this later
          </Link>
        </p>
      ) : null}
    </section>
  );
}
