"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchPitchers, type Pitcher } from "@/lib/api";

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
  const [results, setResults] = useState<Pitcher[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await searchPitchers(q.trim(), 8);
        setResults(rows);
        setActive(0);
        setOpen(true);
        setError(null);
      } catch {
        setError("API UNREACHABLE :8000");
        setOpen(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (p: Pitcher) => {
    setOpen(false);
    router.push(`/pitcher/${p.player_id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

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
                onClick={() => go(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                  i === active ? "bg-surface-2 text-ink" : "text-ink-2"
                }`}
              >
                <span>{p.full_name ?? `#${p.player_id}`}</span>
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
