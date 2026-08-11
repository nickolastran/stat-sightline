"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Calendar from "@/components/ui/Calendar";

/*
 * The date button and its month-grid popover, in one piece: the scoreboard
 * strip and the full scoreboard page both open the same control, one holding
 * the day in state and the other in the URL. Dates are YYYY-MM-DD throughout,
 * formatted in UTC so the label always names the day the caller asked for
 * rather than the viewer's own.
 */

const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="17" stroke="currentColor" strokeWidth="2" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function DatePicker({
  value,
  today,
  onSelect,
  disabled = false,
}: {
  value: string; // YYYY-MM-DD
  today: string;
  onSelect: (date: string) => void;
  /** Dim the button while the caller is loading the day it was handed. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-7 items-center gap-1.5 border px-2 text-[10px] tracking-wider ${
          open
            ? "border-accent bg-accent/15 text-ink"
            : "border-line text-ink-2 hover:border-accent hover:text-ink"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <CalendarIcon />
        {LABEL.format(new Date(`${value}T00:00:00Z`)).toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-1 sm:left-0 sm:right-auto"
          >
            <Calendar
              value={value}
              today={today}
              onSelect={(d) => {
                setOpen(false);
                onSelect(d);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
