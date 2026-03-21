import type { ReactNode } from "react";

export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-3xl px-6 py-12 pb-24">
        <h1 className="om-heading text-4xl tracking-wide text-white">{title}</h1>
        <p className="mt-2 text-xs text-white/50">Last updated: {updated}</p>
        <article className="mt-10 space-y-5 text-sm leading-relaxed text-white/80 [&_h2]:mt-9 [&_h2]:scroll-mt-24 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:first:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:text-[rgb(var(--om-neon))] [&_a]:underline [&_a]:hover:brightness-110">
          {children}
        </article>
      </main>
    </div>
  );
}
