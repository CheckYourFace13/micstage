import Link from "next/link";
import type { SetupChecklistItem } from "@/lib/onboarding/setupProgress";
import { setupCompletionPct } from "@/lib/onboarding/setupProgress";

export function SetupChecklist(props: {
  heading: string;
  subheading: string;
  items: SetupChecklistItem[];
  laterHref?: string;
}) {
  const pct = setupCompletionPct(props.items);
  const remaining = props.items.filter((i) => !i.done);

  if (remaining.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">{props.heading}</h2>
        <p className="mt-1 text-sm text-white/75">You&apos;re all set for now. You can always edit details later.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{props.heading}</h2>
          <p className="mt-1 text-sm text-white/65">{props.subheading}</p>
        </div>
        <div className="text-sm font-semibold text-white/80">{pct}% complete</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[rgb(var(--om-neon))]" style={{ width: `${pct}%` }} />
      </div>
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
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
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
