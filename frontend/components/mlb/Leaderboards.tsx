"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSetParam } from "@/lib/useSetParam";
import type { Leaderboard, LeaderRow, PlayerGameType } from "@/lib/mlb";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";

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

/* One height for every line — a headshot, a club mark or nothing at all —
   so a card is the same size whatever it ranks. */
const LINE = "flex h-8 items-center gap-2 border-b border-grid px-3 text-xs last:border-b-0";

/* The footer strip, link or not, so a card with no full board behind it
   still ends where its neighbours do. */
const FOOT =
  "flex items-center justify-center gap-1 border-t border-line py-1 text-[10px] tracking-[0.2em] text-ink-3";

/** One ranked line: rank (tie-marked), player, value. */
function Row({ leader, tied }: { leader: LeaderRow; tied: boolean }) {
  return (
    <li className={LINE}>
      <span className="w-6 text-right text-[10px] text-ink-3 tabular-nums">
        {tied ? `T-${leader.rank}` : leader.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        {leader.teamId ? (
          <TeamLink id={leader.teamId} name={leader.name} />
        ) : (
          <PlayerLink id={leader.personId}>{leader.name}</PlayerLink>
        )}
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
function Board({
  board,
  season,
  gameType,
  teams,
}: {
  board: Leaderboard;
  season: number;
  gameType: PlayerGameType;
  teams: boolean;
}) {
  const tied = tiedRanks(board.leaders);
  /* A club card hands off to the team table on the same season, type and
     group. */
  const href = !board.stat
    ? null
    : teams
      ? `/league/teams?season=${season}&group=${board.group}${gameType === "R" ? "" : `&type=${gameType}`}`
      : `/league/players?season=${season}&group=${board.group}&stat=${board.stat}&type=${gameType}`;

  return (
    <div className="self-start border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {board.label}
      </h3>
      <ol>
        {board.leaders.slice(0, SHOWN).map((l) => (
          <Row key={l.teamId ?? l.personId} leader={l} tied={tied.has(l.rank)} />
        ))}
        {/* A short board — early spring, a thin October pool — keeps five
            lines, the empty ones blank. */}
        {Array.from({ length: Math.max(0, SHOWN - board.leaders.length) }, (_, i) => (
          <li key={`pad-${i}`} className={LINE} aria-hidden />
        ))}
      </ol>
      {href ? (
        <Link href={href} className={`${FOOT} hover:text-ink`}>
          COMPLETE LIST →
        </Link>
      ) : (
        <div className={FOOT} aria-hidden>
          &nbsp;
        </div>
      )}
    </div>
  );
}

export default function Leaderboards({
  boards,
  season,
  gameType = "R",
  teams = false,
}: {
  boards: Leaderboard[];
  season: number;
  gameType?: PlayerGameType;
  /** Club cards rather than player ones — the TEAM LEADERS section. */
  teams?: boolean;
}) {
  /* In the URL rather than in state, so a refresh keeps the group. */
  const setParam = useSetParam();
  const group =
    useSearchParams().get("group") === "pitching" ? "pitching" : "hitting";
  const shown = boards.filter((b) => b.group === group && b.leaders.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <SegmentedControl<"hitting" | "pitching">
          ariaLabel="Stat group"
          value={group}
          onChange={(g) => setParam("group", g)}
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
            <Board
              key={b.code}
              board={b}
              season={season}
              gameType={gameType}
              teams={teams}
            />
          ))}
        </div>
      )}
    </div>
  );
}
