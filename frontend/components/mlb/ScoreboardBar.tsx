"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { todayET, type Game } from "@/lib/mlb";
import GameCard from "@/components/mlb/GameCard";
import { SkeletonGameCard } from "@/components/ui/Skeleton";

/*
 * Global scoreboard strip under the header. Collapsed: a horizontally
 * scrolling preview of the day's games. The calendar button expands a panel
 * with date navigation and every game in full. Games load client-side from
 * the same-origin /api/games proxy, with motion skeletons so the strip never
 * looks frozen.
 */

const STATE_ORDER: Record<string, number> = { Live: 0, Preview: 1, Final: 2 };
const shift = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="17" stroke="currentColor" strokeWidth="2" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export default function ScoreboardBar() {
  const today = todayET();
  const [date, setDate] = useState(today);
  const [games, setGames] = useState<Game[] | null>(null); // null = loading
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setGames(null);
    setError(false);
    fetch(`/api/games?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setGames(d.games ?? []);
        setError(!!d.error);
      })
      .catch(() => {
        if (!alive) return;
        setGames([]);
        setError(true);
      });
    return () => {
      alive = false;
    };
  }, [date]);

  const loading = games === null;
  const sorted = (games ?? [])
    .slice()
    .sort(
      (a, b) =>
        (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) ||
        a.startTime.localeCompare(b.startTime)
    );

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div className="border-b border-line bg-bg">
      {/* ── Strip header ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="shrink-0 text-[10px] tracking-[0.25em] text-ink-3">
          SCOREBOARD
        </span>
        <span className="shrink-0 text-[10px] text-ink-3">
          {date === today ? "TODAY" : dateLabel.toUpperCase()} ·{" "}
          {loading ? "…" : `${sorted.length} GAMES`}
        </span>
        <div className="ml-auto flex items-center gap-px">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDate((d) => shift(d, -1))}
            className="h-7 w-7 border border-line text-ink-2 hover:border-accent hover:text-ink"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDate((d) => shift(d, 1))}
            className="h-7 w-7 border border-line text-ink-2 hover:border-accent hover:text-ink"
          >
            ›
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label="Show all games"
            onClick={() => setOpen((o) => !o)}
            className={`flex h-7 items-center gap-1.5 border px-2 text-[10px] tracking-wider ${
              open
                ? "border-accent bg-accent/15 text-ink"
                : "border-line text-ink-2 hover:border-accent hover:text-ink"
            }`}
          >
            <CalendarIcon />
            ALL GAMES
          </button>
        </div>
      </div>

      {/* ── Collapsed preview strip ──────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[220px] shrink-0">
              <SkeletonGameCard delay={i * 0.12} />
            </div>
          ))
        ) : sorted.length === 0 ? (
          <p className="py-2 text-[11px] text-ink-3">
            {error
              ? "SCOREBOARD UNAVAILABLE — MLB API UNREACHABLE"
              : "NO GAMES ON THIS DATE"}
          </p>
        ) : (
          sorted.map((g, i) => (
            <motion.div
              key={g.pk}
              className="w-[220px] shrink-0"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
            >
              <GameCard game={g} />
            </motion.div>
          ))
        )}
      </div>

      {/* ── Expanded full-day panel ──────────────────────────── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="all-games"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden border-t border-line bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="text-[10px] tracking-[0.25em] text-ink-3">
                ALL GAMES — {dateLabel.toUpperCase()}
              </span>
              <div className="flex items-center gap-px">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  aria-label="Pick a date"
                  className="h-7 border border-line bg-surface px-2 text-xs text-ink focus:border-accent focus:outline-none"
                />
                {date !== today && (
                  <button
                    type="button"
                    onClick={() => setDate(today)}
                    className="ml-1 h-7 border border-line px-2 text-[10px] tracking-wide text-ink-2 hover:border-accent hover:text-ink"
                  >
                    TODAY
                  </button>
                )}
              </div>
            </div>
            <div className="px-4 pb-3">
              {loading ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonGameCard key={i} delay={i * 0.1} />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-3">
                  NO GAMES SCHEDULED ON THIS DATE
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {sorted.map((g) => (
                    <GameCard key={g.pk} game={g} detailed />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
