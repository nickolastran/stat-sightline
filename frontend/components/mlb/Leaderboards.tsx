"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Leaderboard, LeaderRow } from "@/lib/mlb";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";

/*
 * Season stat leaders, split into hitting / pitching via a segmented toggle.
 * Each category renders a compact ranked list. Data is fetched server-side
 * and passed in whole; this component only picks which group to show.
 */

/**
 * The ranks more than one leader holds — shown as "T-3" rather than three
 * players each reading a bare 3. The API hands out the same rank to everyone
 * tied (and returns the whole tie group even when that overruns the limit),
 * so a repeat in the rendered rows is the tie.
 */
const tiedRanks = (leaders: LeaderRow[]) =>
  new Set(
    leaders.map((l) => l.rank).filter((r, i, all) => all.indexOf(r) !== i)
  );

/** Rows shown before the board is expanded, and the ceiling once it is. */
const COLLAPSED = 5;
const EXPANDED = 20;

/** One ranked line: rank (tie-marked), player, value. */
function Row({ leader, tied }: { leader: LeaderRow; tied: boolean }) {
  return (
    <li className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0">
      <span className="w-6 text-right text-[10px] text-ink-3 tabular-nums">
        {tied ? `T-${leader.rank}` : leader.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        <PlayerLink id={leader.personId}>{leader.name}</PlayerLink>
      </span>
      <span className="w-14 text-right font-bold text-ink tabular-nums">
        {leader.value}
      </span>
    </li>
  );
}

/**
 * One category. Every board rests at a flat five rows — a tie straddling the
 * cutoff is cut mid-group rather than allowed to spill, so the grid stays
 * even; the "T-" rank is what marks the players left off. MORE rolls the rest
 * of the top 20 open, cut the same way at its own edge.
 */
function Board({ board }: { board: Leaderboard }) {
  const [open, setOpen] = useState(false);
  const tied = tiedRanks(board.leaders);
  const head = board.leaders.slice(0, COLLAPSED);
  const rest = board.leaders.slice(COLLAPSED, EXPANDED);

  return (
    <div className="self-start border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {board.label}
      </h3>
      <ol>
        {head.map((l) => (
          <Row key={l.personId} leader={l} tied={tied.has(l.rank)} />
        ))}
      </ol>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="rest"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* Top rule stands in for the fifth row's — which `last:` drops so
                the collapsed card never doubles up against the button. */}
            <ol className="border-t border-grid">
              {rest.map((l) => (
                <Row key={l.personId} leader={l} tied={tied.has(l.rank)} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-1 border-t border-line py-1 text-[10px] tracking-[0.2em] text-ink-3 hover:text-ink"
        >
          {open ? "LESS" : "MORE"}
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="inline-block leading-none"
          >
            ▼
          </motion.span>
        </button>
      )}
    </div>
  );
}

export default function Leaderboards({ boards }: { boards: Leaderboard[] }) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");
  const shown = boards.filter((b) => b.group === group && b.leaders.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.25em] text-ink-3">
          {shown.length} CATEGORIES · {group.toUpperCase()}
        </p>
        <SegmentedControl<"hitting" | "pitching">
          ariaLabel="Stat group"
          value={group}
          onChange={setGroup}
          options={[
            { value: "hitting", label: "HITTING" },
            { value: "pitching", label: "PITCHING" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO LEADER DATA FOR THIS SEASON YET
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((b) => (
            <Board key={b.code} board={b} />
          ))}
        </div>
      )}
    </div>
  );
}
