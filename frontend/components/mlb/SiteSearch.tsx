"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTypeahead } from "@/lib/useTypeahead";
import { playerHeadshot, teamLogo, type SearchHit } from "@/lib/mlb";

/*
 * Header search — any club or any person in MLB's records, in one box beside
 * the sign-in button. A hit routes to whichever page can actually show it, so
 * the two kinds live in one list rather than in two boxes the reader has to
 * choose between before they have typed anything.
 */

async function search(q: string): Promise<SearchHit[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).hits ?? [];
}

export default function SiteSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const t = useTypeahead<SearchHit>(q, search, (hit) => {
    setQ("");
    router.push(`/${hit.kind}/${hit.id}`);
  });

  return (
    <div ref={t.rootRef} className="relative">
      <input
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={t.open}
        aria-label="Search players and teams"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={t.onKeyDown}
        onFocus={() => t.results.length && t.setOpen(true)}
        placeholder="SEARCH PLAYER / TEAM"
        className="h-7 w-36 border border-line bg-surface px-2 text-[10px] tracking-wider text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none sm:w-56"
      />

      {t.error && (
        <p className="absolute right-0 z-30 mt-px border border-crit bg-surface px-2 py-1 text-[10px] text-crit">
          {t.error}
        </p>
      )}

      {t.open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-px max-h-80 w-72 overflow-y-auto border border-line bg-surface"
        >
          {t.results.length === 0 && (
            <li className="px-3 py-2 text-[10px] tracking-wider text-ink-3">
              NO MATCH
            </li>
          )}
          {t.results.map((hit, i) => (
            <li
              key={`${hit.kind}-${hit.id}`}
              role="option"
              aria-selected={i === t.active}
            >
              <button
                type="button"
                onMouseEnter={() => t.setActive(i)}
                onClick={() => t.pick(hit)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                  i === t.active ? "bg-surface-2 text-ink" : "text-ink-2"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    hit.kind === "team"
                      ? teamLogo(hit.id)
                      : playerHeadshot(hit.id)
                  }
                  alt=""
                  width={20}
                  height={20}
                  loading="lazy"
                  className={`h-5 w-5 shrink-0 bg-surface-2 ${
                    hit.kind === "team" ? "" : "rounded-full"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{hit.name}</span>
                  {hit.detail && (
                    <span className="block truncate text-[10px] text-ink-3">
                      {hit.detail}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[9px] tracking-widest text-ink-3">
                  {hit.kind === "team" ? "TEAM" : "PLAYER"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
