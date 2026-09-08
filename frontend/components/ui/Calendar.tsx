"use client";

import { useState } from "react";

/*
 * Month-grid date picker. Works entirely on YYYY-MM-DD strings and UTC date
 * math so a browser east or west of the game day never shifts a cell — the
 * scoreboard's notion of "day" is the game day (America/Los_Angeles), resolved by the
 * caller, not the local clock.
 */

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Step the visible month by ±1 with the year rolling over. */
const stepMonth = (c: { y: number; m: number }, by: number) => {
  const t = c.y * 12 + c.m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
};

const NavButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="h-6 w-6 border border-line text-ink-2 hover:border-accent hover:text-ink"
  >
    {children}
  </button>
);

export default function Calendar({
  value,
  today,
  onSelect,
}: {
  value: string; // YYYY-MM-DD
  today: string;
  onSelect: (date: string) => void;
}) {
  const [cursor, setCursor] = useState({
    y: Number(value.slice(0, 4)),
    m: Number(value.slice(5, 7)) - 1,
  });

  const lead = firstWeekday(cursor.y, cursor.m);
  const total = daysIn(cursor.y, cursor.m);
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="w-64 border border-line bg-surface p-2 shadow-lg">
      {/* ── Month / year navigation ──────────────────────────── */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex gap-px">
          <NavButton
            label="Previous year"
            onClick={() => setCursor((c) => ({ ...c, y: c.y - 1 }))}
          >
            «
          </NavButton>
          <NavButton
            label="Previous month"
            onClick={() => setCursor((c) => stepMonth(c, -1))}
          >
            ‹
          </NavButton>
        </div>
        <span className="text-[10px] tracking-[0.2em] text-ink-2">
          {MONTHS[cursor.m]} {cursor.y}
        </span>
        <div className="flex gap-px">
          <NavButton
            label="Next month"
            onClick={() => setCursor((c) => stepMonth(c, 1))}
          >
            ›
          </NavButton>
          <NavButton
            label="Next year"
            onClick={() => setCursor((c) => ({ ...c, y: c.y + 1 }))}
          >
            »
          </NavButton>
        </div>
      </div>

      {/* ── Weekday header ───────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-px">
        {DOW.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="py-1 text-center text-[9px] tracking-wider text-ink-3"
          >
            {d}
          </span>
        ))}
      </div>

      {/* ── Day grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => {
          if (d === null) return <span key={`pad-${i}`} />;
          const date = iso(cursor.y, cursor.m, d);
          const selected = date === value;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              aria-label={date}
              aria-current={selected ? "date" : undefined}
              onClick={() => onSelect(date)}
              className={`h-7 border text-[11px] tabular-nums ${
                selected
                  ? "border-accent bg-accent font-bold text-white"
                  : isToday
                    ? "border-accent text-ink hover:bg-surface-2"
                    : "border-transparent text-ink-2 hover:border-line hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* ── Jump back to the current game day ────────────────── */}
      <button
        type="button"
        onClick={() => onSelect(today)}
        className="mt-2 w-full border border-line py-1 text-[10px] tracking-[0.2em] text-ink-2 hover:border-accent hover:text-ink"
      >
        TODAY
      </button>
    </div>
  );
}
