"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTypeahead } from "@/lib/useTypeahead";
import { searchPitchers, type Pitcher, type Role } from "@/lib/api";
import { playerHeadshot, type SearchHit } from "@/lib/mlb";

/*
 * Debounced player typeahead. Selecting a result routes to the dashboard
 * scoped to that player — or, given `param`, sets that query parameter on
 * the current page instead (the matchup page's two pickers). `role` picks
 * pitchers or batters. `size` switches between the landing hero input and
 * the compact dashboard-header variant.
 */

const ROUTE: Record<Role, string> = { pitcher: "/pitcher", batter: "/hitter" };

/** A result: the warehouse's, or MLB's with its position and club. */
type Hit = Pitcher & { detail?: string };

/**
 * MLB's people search through the site's own proxy — what the deployed site,
 * which has no warehouse API, searches instead. The listed position tells a
 * pitcher from a hitter; a two-way player is both.
 */
async function mlbSearch(q: string, role: Role): Promise<Hit[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&mlb`);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const { hits } = (await res.json()) as { hits: SearchHit[] };
  return hits
    .filter((h) => {
      const pos = h.detail.split(" · ")[0];
      return h.kind === "player" && (pos === "TWP" || (pos === "P") === (role === "pitcher"));
    })
    .map((h) => ({ player_id: h.id, full_name: h.name, throws: null, detail: h.detail }));
}

interface Props {
  role?: Role;
  param?: string;
  size?: "hero" | "compact";
  placeholder?: string;
  autoFocus?: boolean;
}

export default function PlayerSearch({
  role = "pitcher",
  param,
  size = "hero",
  placeholder = "SEARCH PITCHER — NAME OR FRAGMENT",
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { results, open, setOpen, active, setActive, error, rootRef, onKeyDown, pick } =
    useTypeahead<Hit>(
      q,
      (query) =>
        searchPitchers(query, 8, undefined, role).catch(() => mlbSearch(query, role)),
      (p) => {
        if (!param) return router.push(`${ROUTE[role]}/${p.player_id}`);
        const next = new URLSearchParams(window.location.search);
        next.set(param, String(p.player_id));
        router.push(`?${next}`);
        // Clear the box so the placeholder shows who was picked.
        setQ("");
      }
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
          aria-label={`Search ${role}s`}
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
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    className="h-5 w-5 shrink-0"
                  />
                  <span className="truncate">
                    {p.full_name ?? `#${p.player_id}`}
                  </span>
                </span>
                <span className="text-ink-3">
                  {p.detail ??
                    `${role === "pitcher" ? `${p.throws ?? "?"}HP` : `BATS ${p.bats ?? "?"}`} · ${p.pitches?.toLocaleString()} P`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
