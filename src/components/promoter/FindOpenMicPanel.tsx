"use client";

import { useEffect, useRef, useState } from "react";
import { requestPromoterVenueAccessByVenueIdAction } from "@/app/promoter/actions";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type SearchHit = {
  kind: "venue" | "listing";
  id: string;
  name: string;
  place: string | null;
  canRequestHostAccess: boolean;
  venueId?: string | null;
  listingPath?: string;
};

export function FindOpenMicPanel(props: {
  suggested?: Array<{
    kind: "venue" | "listing";
    id: string;
    name: string;
    place: string | null;
    venueId?: string;
  }>;
  /** Prefill search (e.g. venue name from promoter application notes). */
  initialQuery?: string;
}) {
  const [q, setQ] = useState(props.initialQuery?.trim() ?? "");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const didInitSearch = useRef(false);

  function onQueryChange(value: string) {
    setQ(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestId = ++requestIdRef.current;
    timerRef.current = setTimeout(() => {
      void fetch(`/api/promoter/search-open-mics?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: { ok?: boolean; results?: SearchHit[] }) => {
          if (requestId !== requestIdRef.current) return;
          setResults(data.ok && Array.isArray(data.results) ? data.results : []);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, 280);
  }

  useEffect(() => {
    if (didInitSearch.current) return;
    const initial = props.initialQuery?.trim() ?? "";
    if (initial.length < 2) return;
    didInitSearch.current = true;
    onQueryChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill on mount
  }, []);

  const suggested = props.suggested ?? [];

  return (
    <div className="grid gap-4">
      {suggested.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-white/90">Is this your open mic?</p>
          <ul className="grid gap-2">
            {suggested.map((s) => (
              <li
                key={`${s.kind}:${s.id}`}
                className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white">{s.name}</div>
                  {s.place ? <div className="text-xs text-white/55">{s.place}</div> : null}
                </div>
                {s.venueId ? (
                  <form action={requestPromoterVenueAccessByVenueIdAction}>
                    <input type="hidden" name="venueId" value={s.venueId} />
                    <FormSubmitButton
                      label="Yes, this is mine"
                      pendingLabel="Connecting…"
                      className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-md border border-emerald-400/35 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-60"
                    />
                  </form>
                ) : (
                  <p className="max-w-xs text-xs text-white/55">
                    We found this open mic listing. Search below for the venue name — we&apos;ll ask them to approve if
                    needed.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="grid gap-1 text-sm">
        <span className="text-white/80">Find your open mic or venue</span>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-12 rounded-md border border-white/10 bg-black/40 px-3 text-base text-white placeholder:text-white/40"
          placeholder="Type the venue or open mic name"
          autoComplete="off"
        />
        <span className="text-xs text-white/50">Search by name — no codes or special links needed.</span>
      </label>

      {loading ? <p className="text-xs text-white/45">Searching…</p> : null}

      {results.length > 0 ? (
        <ul className="grid gap-2">
          {results.map((r) => (
            <li
              key={`${r.kind}:${r.id}`}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium text-white">{r.name}</div>
                {r.place ? <div className="text-xs text-white/55">{r.place}</div> : null}
              </div>
              {r.canRequestHostAccess && r.venueId ? (
                <form action={requestPromoterVenueAccessByVenueIdAction}>
                  <input type="hidden" name="venueId" value={r.venueId} />
                  <FormSubmitButton
                    label="Yes — I host here"
                    pendingLabel="Sending…"
                    className="inline-flex h-11 min-w-[150px] items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-50 hover:bg-violet-500/25 disabled:opacity-60"
                  />
                </form>
              ) : r.listingPath ? (
                <a
                  href={r.listingPath}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                >
                  View listing
                </a>
              ) : (
                <span className="text-xs text-white/50">Not connected on MicStage yet</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-white/45">
        Do you host an open mic at this venue? We&apos;ll notify the venue if approval is needed. You can skip this and
        come back later.
      </p>
    </div>
  );
}
