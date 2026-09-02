"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTypeahead } from "@/lib/useTypeahead";
import { searchPitchers, type Pitcher } from "@/lib/api";
import { playerHeadshot } from "@/lib/mlb";

/*
 * Debounced player typeahead. Selecting a result routes to the dashboard
 * scoped to that player. `size` switches between the landing hero input
 * and the compact dashboard-header variant.
 */

interface Props {
  size?: "hero" | "compact";
  placeholder?: string;
  autoFocus?: boolean;
}

export default function PlayerSearch({
  size = "hero",
  placeholder = "SEARCH PITCHER — NAME OR FRAGMENT",
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { results, open, setOpen, active, setActive, error, rootRef, onKeyDown, pick } =
    useTypeahead<Pitcher>(
      q,
      (query) => searchPitchers(query, 8),
      (p) => router.push(`/pitcher/${p.player_id}`)
    );

  const heroSizing = size === "hero" ? "h-14 text-base" : "h-8 text-xs";

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex">
        <span
          className={`flex items-center border border-r-0 border-line bg-surface px-3 text-ink-3 ${heroSizing}`}
          aria-hidden
        >
          &gt;_
        </span>
        <input
          type="search"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-label="Search pitchers"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className={`w-full border border-line bg-surface px-3 tracking-wide text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none ${heroSizing}`}
        />
      </div>
      {error && (
        <p className="absolute mt-1 border border-crit bg-surface px-2 py-1 text-xs text-crit">
          {error}
        </p>
      )}
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-px max-h-80 w-full overflow-y-auto border border-line bg-surface"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-ink-3">NO MATCH</li>
          )}
          {results.map((p, i) => (
            <li key={p.player_id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                  i === active ? "bg-surface-2 text-ink" : "text-ink-2"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={playerHeadshot(p.player_id)}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    className="h-5 w-5 shrink-0"
                  />
                  <span className="truncate">
                    {p.full_name ?? `#${p.player_id}`}
                  </span>
                </span>
                <span className="text-ink-3">
                  {p.throws ?? "?"}HP · {p.pitches?.toLocaleString()} P
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
