"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type VenueSlotArtistSuggestion = { id: string | null; stageName: string; kind: string };

type PoolRow = { id: string | null; stageName: string };

type Props = {
  venueId: string;
  suggestions: VenueSlotArtistSuggestion[];
  defaultDisplay: string;
  nameArtist?: string;
  nameMusicianId?: string;
};

export function VenueSlotArtistField({
  venueId,
  suggestions,
  defaultDisplay,
  nameArtist = "artistDisplay",
  nameMusicianId = "selectedMusicianId",
}: Props) {
  const [text, setText] = useState(defaultDisplay);
  const [selectedId, setSelectedId] = useState("");
  const [remote, setRemote] = useState<{ id: string; stageName: string }[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergedLocal = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t) return suggestions.slice(0, 10);
    return suggestions.filter((s) => s.stageName.toLowerCase().includes(t)).slice(0, 10);
  }, [suggestions, text]);

  const onTextChange = (v: string) => {
    setText(v);
    setSelectedId("");
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const q = v.trim();
      if (q.length < 2) {
        setRemote([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/venue/musicians/search?venueId=${encodeURIComponent(venueId)}&q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { musicians?: { id: string; stageName: string }[] };
        setRemote(data.musicians ?? []);
      } catch {
        setRemote([]);
      }
    }, 250);
  };

  const pick = useCallback((id: string | null, name: string) => {
    setSelectedId(id ?? "");
    setText(name);
    setOpen(false);
    setRemote([]);
  }, []);

  const pool: PoolRow[] = useMemo(() => {
    const seen = new Set<string>();
    const out: PoolRow[] = [];
    for (const s of mergedLocal) {
      const k = s.id ?? `m:${s.stageName.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: s.id, stageName: s.stageName });
    }
    for (const r of remote) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ id: r.id, stageName: r.stageName });
    }
    return out.slice(0, 12);
  }, [mergedLocal, remote]);

  return (
    <div className="relative min-w-0 flex-1">
      <input type="hidden" name={nameMusicianId} value={selectedId} />
      <input
        name={nameArtist}
        type="text"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 180);
        }}
        placeholder="Search MicStage or type name"
        autoComplete="off"
        className="h-9 w-full min-w-0 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white placeholder:text-white/35"
      />
      {open && pool.length > 0 ? (
        <ul
          className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-44 overflow-auto rounded-md border border-white/15 bg-zinc-950 py-1 text-sm shadow-lg"
          role="listbox"
        >
          {pool.map((p) => (
            <li key={(p.id ?? "m") + p.stageName}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-white/95 hover:bg-white/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p.id, p.stageName)}
              >
                <span>{p.stageName}</span>
                {p.id ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300/80">account</span>
                ) : (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-white/40">saved name</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
