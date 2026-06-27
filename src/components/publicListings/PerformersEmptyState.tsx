import Link from "next/link";

export function PerformersEmptyState(props: { query?: string }) {
  const { query } = props;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
      <p className="font-semibold text-white/90">
        {query ? "No artists match that search yet." : "Be the first artist in your market."}
      </p>
      <p className="mt-2 text-white/65">
        MicStage lists stage names so performers get discovered when they book local open mics.
      </p>
      <ul className="mt-4 grid gap-2">
        <li>
          <Link href="/register/musician" className="font-semibold text-[rgb(var(--om-neon))] underline">
            Create your artist profile
          </Link>
        </li>
        <li>
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
            Browse open mics near you
          </Link>
        </li>
        <li>
          <Link href="/locations" className="text-[rgb(var(--om-neon))] underline">
            See who is booking by metro
          </Link>
        </li>
      </ul>
    </div>
  );
}
