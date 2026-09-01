"use client";

import Link from "next/link";
import { useState } from "react";
import type { Leaderboard, LeaderRow } from "@/lib/mlb";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";

/*
 * Season stat leaders, split into hitting / pitching via a segmented toggle.
 * Each category renders a compact ranked list over a link to the full board.
 * Data is fetched server-side and passed in whole; this component only picks
 * which group to show.
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

/** Rows a card carries — the rest of the league is a page of its own. */
const SHOWN = 5;

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
 * One category, flat at five rows — a tie straddling the cutoff is cut mid-
 * group rather than allowed to spill, so the grid stays even; the "T-" rank is
 * what marks the players left off. The whole league in this figure is the
 * player table, ranked and filterable, rather than more rows in a box.
 */
function Board({ board, season }: { board: Leaderboard; season: number }) {
  const tied = tiedRanks(board.leaders);

  return (
    <div className="self-start border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {board.label}
      </h3>
      <ol>
        {board.leaders.slice(0, SHOWN).map((l) => (
          <Row key={l.personId} leader={l} tied={tied.has(l.rank)} />
        ))}
      </ol>
      <Link
        href={`/league/players?season=${season}&group=${board.group}&stat=${board.stat}`}
        className="flex items-center justify-center gap-1 border-t border-line py-1 text-[10px] tracking-[0.2em] text-ink-3 hover:text-ink"
      >
        COMPLETE LIST →
      </Link>
    </div>
  );
}

export default function Leaderboards({
  boards,
  season,
}: {
  boards: Leaderboard[];
  season: number;
}) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");
  const shown = boards.filter((b) => b.group === group && b.leaders.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
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
            <Board key={b.code} board={b} season={season} />
          ))}
        </div>
      )}
    </div>
  );
}
