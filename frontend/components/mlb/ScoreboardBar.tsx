"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { sortGames, todayET, type Game } from "@/lib/mlb";
import GameCard from "@/components/mlb/GameCard";
import DatePicker from "@/components/ui/DatePicker";
import { SkeletonGameCard } from "@/components/ui/Skeleton";

/*
 * Global scoreboard strip under the header. One horizontal rail of the
 * chosen day's games, paged by the ‹ › arrows rather than a manual drag;
 * the date button opens a month calendar to jump to any day, and a card
 * navigates to that game's box score page. Games load client-side from the
 * same-origin /api/games proxy, with motion skeletons so the strip never
 * looks frozen.
 */

const CARD_W = 228; // 220px card + 8px gap — the minimum arrow step

const ArrowButton = ({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="h-7 w-7 border border-line text-ink-2 enabled:hover:border-accent enabled:hover:text-ink disabled:text-ink-3 disabled:opacity-40"
  >
    {children}
  </button>
);

export default function ScoreboardBar() {
  const today = todayET();
  const [date, setDate] = useState(today);
  const [games, setGames] = useState<Game[] | null>(null); // null = loading
  const [error, setError] = useState(false);
  const [arrows, setArrows] = useState({ prev: false, next: false });

  const stripRef = useRef<HTMLDivElement>(null);

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

  /* ── Arrow paging ─────────────────────────────────────────── */

  const syncArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setArrows({ prev: el.scrollLeft > 4, next: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollLeft = 0; // a new day starts at the first game
    syncArrows();
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [games, syncArrows]);

  const page = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    // Scroll close to a full viewport, snapped down to whole cards.
    const step = Math.max(Math.floor(el.clientWidth / CARD_W), 1) * CARD_W;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const loading = games === null;
  const sorted = sortGames(games ?? []);

  return (
    <div className="border-b border-line bg-bg">
      {/* ── Strip header ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="hidden shrink-0 text-[10px] tracking-[0.25em] text-ink-3 sm:inline">
          SCOREBOARD
        </span>

        <DatePicker value={date} today={today} onSelect={setDate} />

        <div className="ml-auto flex items-center gap-px">
          <ArrowButton
            label="Scroll to earlier games"
            disabled={loading || !arrows.prev}
            onClick={() => page(-1)}
          >
            ‹
          </ArrowButton>
          <ArrowButton
            label="Scroll to later games"
            disabled={loading || !arrows.next}
            onClick={() => page(1)}
          >
            ›
          </ArrowButton>
        </div>
      </div>

      {/* ── Game rail ────────────────────────────────────────── */}
      <div
        ref={stripRef}
        onScroll={syncArrows}
        className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2"
      >
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
              <Link
                href={`/game/${g.pk}`}
                aria-label={`Box score — ${g.away.name} at ${g.home.name}`}
                className="block focus-visible:outline-2 focus-visible:outline-accent"
              >
                <GameCard game={g} className="hover:border-accent" />
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
