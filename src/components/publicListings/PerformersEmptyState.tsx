import Link from "next/link";

export function PerformersEmptyState(props: { query?: string }) {
  const { query } = props;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
      <p className="font-semibold text-white/90">
        {query ? "No artists match that search yet." : "No artists are listed here yet."}
      </p>
      <p className="mt-2 text-white/65">
        Create a free artist profile to appear by stage name, or browse open mics near you.
      </p>
      <ul className="mt-4 grid gap-2">
        <li>
          <Link href="/register/musician" className="font-semibold text-[rgb(var(--om-neon))] underline">
            Create your artist profile
          </Link>
        </li>
        <li>
          <Link href="/find-open-mics" className="text-[rgb(var(--om-neon))] underline">
            Find open mics
          </Link>
        </li>
      </ul>
    </div>
  );
}
