"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { todayET, type Game } from "@/lib/mlb";
import GameCard from "@/components/mlb/GameCard";
import GameFeedLink from "@/components/mlb/GameFeedLink";
import Calendar from "@/components/ui/Calendar";
import { SkeletonGameCard } from "@/components/ui/Skeleton";

/*
 * Global scoreboard strip under the header. One horizontal rail of the
 * chosen day's games, paged by the ‹ › arrows rather than a manual drag;
 * the date button opens a month calendar to jump to any day, and a card
 * navigates to that game's box score page. Games load client-side from the
 * same-origin /api/games proxy, with motion skeletons so the strip never
 * looks frozen.
 */

const STATE_ORDER: Record<string, number> = { Live: 0, Preview: 1, Final: 2 };
const CARD_W = 228; // 220px card + 8px gap — the minimum arrow step

const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="17" stroke="currentColor" strokeWidth="2" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [arrows, setArrows] = useState({ prev: false, next: false });

  const stripRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  /* ── Date picker dismissal ────────────────────────────────── */

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

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
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div className="border-b border-line bg-bg">
      {/* ── Strip header ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="hidden shrink-0 text-[10px] tracking-[0.25em] text-ink-3 sm:inline">
          SCOREBOARD
        </span>

        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className={`flex h-7 items-center gap-1.5 border px-2 text-[10px] tracking-wider ${
              pickerOpen
                ? "border-accent bg-accent/15 text-ink"
                : "border-line text-ink-2 hover:border-accent hover:text-ink"
            }`}
          >
            <CalendarIcon />
            {dateLabel.toUpperCase()}
          </button>
          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full z-50 mt-1"
              >
                <Calendar
                  value={date}
                  today={today}
                  onSelect={(d) => {
                    setDate(d);
                    setPickerOpen(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="shrink-0 text-[10px] text-ink-3">
          {loading ? "…" : `${sorted.length} GAMES`}
        </span>

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
              className="relative w-[220px] shrink-0"
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
              {/* Overlaid rather than nested: an anchor inside the card's own
                  anchor is invalid HTML. */}
              <GameFeedLink
                pk={g.pk}
                label={`${g.away.name} at ${g.home.name}`}
                className="absolute right-1.5 top-1.5"
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
