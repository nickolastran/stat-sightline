"use client";

import Link from "next/link";
import { useState } from "react";
import { useTimeZone } from "@/lib/useTimeZone";
import {
  gameStatus,
  teamLogo,
  type BoxBatter,
  type BoxPitcher,
  type BoxScore,
  type BoxTeam,
  type Game,
} from "@/lib/mlb";
import Panel from "@/components/ui/Panel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";
import { shortName } from "@/components/mlb/LineupCard";

/*
 * The card at the top of a game page — who is playing, where it stands, and
 * the line score — with whatever the page puts under it: the box score
 * itself on a game that is over, a tab strip on one being played.
 *
 * Both payloads are fetched server-side by /game/[pk] and passed in whole;
 * this is a client component only because the team toggle and the
 * local-timezone status label need the browser.
 */

/* Both lines run nine stat columns, so batting and pitching sit on the same
   grid and the columns hold still when you flip teams. */
const BAT_COLS = ["AB", "R", "H", "RBI", "HR", "BB", "K", "AVG", "OPS"] as const;
const PIT_COLS = ["IP", "H", "R", "ER", "K", "BB", "HR", "P-S", "ERA"] as const;

const batCells = (b: BoxBatter) => [
  b.ab,
  b.r,
  b.h,
  b.rbi,
  b.hr,
  b.bb,
  b.k,
  b.avg,
  b.ops,
];
const pitCells = (p: BoxPitcher) => [
  p.ip,
  p.h,
  p.r,
  p.er,
  p.k,
  p.bb,
  p.hr,
  `${p.pitches}-${p.strikes}`,
  p.era,
];

/* The rail can't hold nine columns, so the mini box keeps the ones a glance
   is actually asking for. */
const BAT_MINI = ["H-AB", "R", "HR", "RBI", "AVG"] as const;
const PIT_MINI = ["IP", "H", "ER", "BB", "K", "P-S", "ERA"] as const;

const batMiniCells = (b: BoxBatter) => [`${b.h}-${b.ab}`, b.r, b.hr, b.rbi, b.avg];
const pitMiniCells = (p: BoxPitcher) => [
  p.ip,
  p.h,
  p.er,
  p.bb,
  p.k,
  `${p.pitches}-${p.strikes}`,
  p.era,
];

/* A pitcher's note can carry more than one decision — "(W, 3-6)(BS, 6)". A
   loss or a blown save is a bad outcome, so it reads red instead of the accent
   the earned decisions use. */
const decisions = (note: string) => note.match(/\([^)]*\)/g) ?? [note];
const isBad = (d: string) => /^\((L|BS)\b/.test(d);

/* ── Linescore ───────────────────────────────────────────────────────── */

function Linescore({ box, game }: { box: BoxScore; game: Game }) {
  const final = game.state === "Final";
  /* The one cell being played — the inning, and which club is in it. Between
     halves MLB says "Middle", and the club coming up to bat is the home one. */
  const now = game.state === "Live" ? game.inning : null;
  const nowSide = game.inningState?.toLowerCase().startsWith("top")
    ? "away"
    : "home";
  // Extra innings extend past the scheduled 9; a suspended game can fall short.
  const count = Math.max(box.scheduledInnings, box.innings.length);
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  const rows: { team: BoxTeam; side: "away" | "home" }[] = [
    { team: box.away, side: "away" },
    { team: box.home, side: "home" },
  ];

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-2 py-1.5 text-left text-[10px] tracking-widest text-ink-3">
              &nbsp;
            </th>
            {nums.map((n) => (
              <th
                key={n}
                scope="col"
                className="w-7 px-1 py-1.5 text-center text-[10px] tabular-nums text-ink-3"
              >
                {n}
              </th>
            ))}
            {["R", "H", "E"].map((c) => (
              <th
                key={c}
                scope="col"
                className="w-8 border-l border-line px-1 py-1.5 text-center text-[10px] tracking-widest text-ink-2"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, side }) => (
            <tr key={side} className="border-b border-grid last:border-b-0">
              <th
                scope="row"
                className="px-2 py-1.5 text-left text-xs font-bold whitespace-nowrap text-ink"
              >
                {team.abbr}
              </th>
              {nums.map((n) => {
                const inn = box.innings.find((i) => i.num === n);
                const runs = inn?.[side] ?? null;
                const playing = n === now && side === nowSide;
                // A home team that never had to bat gets an X, the scorecard
                // convention — but only once the game is over. A half not yet
                // played gets a dash; the one under way gets nothing, since
                // nobody has scored in it *yet*.
                const blank = inn && final ? "X" : playing ? "" : "–";
                return (
                  <td
                    key={n}
                    className={`px-1 py-1.5 text-center tabular-nums ${
                      playing ? "bg-surface-2 font-bold text-ink" : "text-ink-2"
                    }`}
                  >
                    {runs ?? blank}
                  </td>
                );
              })}
              {[team.runs, team.hits, team.errors].map((v, i) => (
                <td
                  key={i}
                  className={`border-l border-line px-1 py-1.5 text-center tabular-nums ${
                    i === 0 ? "font-bold text-ink" : "text-ink-2"
                  }`}
                >
                  {v ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Batting / pitching lines ────────────────────────────────────────── */

function StatTable({
  caption,
  columns,
  rows,
  compact,
}: {
  caption: string;
  columns: readonly string[];
  rows: { key: number; label: React.ReactNode; cells: (string | number)[] }[];
  /** Narrower columns and no floor on the table width — the mini box lives in
   *  a 28rem rail and can't ask for the full nine. */
  compact?: boolean;
}) {
  /* Short names leave the stat columns swimming; the rail reads better with
     them pulled in tight. */
  const stat = compact ? "px-1" : "px-2";
  return (
    <div className="overflow-x-auto border border-line">
      {/* Fixed layout with one width for every stat column: the numbers land in
          the same place in both tables and don't shift as content changes. */}
      <table
        className={`w-full table-fixed border-collapse text-xs ${
          compact ? "" : "min-w-[44rem]"
        }`}
      >
        <colgroup>
          <col />
          {columns.map((c) => (
            <col key={c} className={compact ? "w-10" : "w-14"} />
          ))}
        </colgroup>
        <caption className="border-b border-line px-2 py-1.5 text-left text-[10px] tracking-[0.25em] text-ink-3">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-2 py-1 text-left text-[10px] tracking-widest text-ink-3">
              PLAYER
            </th>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className={`${stat} py-1 text-right text-[10px] tracking-widest text-ink-3`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-2 py-4 text-center text-ink-3"
              >
                NO LINES YET
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-b border-grid last:border-b-0 hover:bg-surface-2"
            >
              <td className="truncate px-2 py-1 text-ink-2">{r.label}</td>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={`${stat} py-1 text-right tabular-nums whitespace-nowrap text-ink-2`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamLines({ team, compact }: { team: BoxTeam; compact?: boolean }) {
  return (
    <div className="space-y-2">
      <StatTable
        compact={compact}
        caption={`${team.abbr} BATTING`}
        columns={compact ? BAT_MINI : BAT_COLS}
        rows={team.batters.map((b) => ({
          key: b.id,
          label: (
            <span className={b.sub ? "pl-3" : ""}>
              {/* The spot belongs to the starter; a sub is read off the arrow
                  under them, not off a repeated number. */}
              {b.sub ? (
                <span className="text-ink-3">↳ </span>
              ) : (
                <span className="mr-1.5 text-[10px] tabular-nums text-ink-3">
                  {b.order}
                </span>
              )}
              <PlayerLink id={b.id} headshot={!compact}>
                {compact ? shortName(b.name) : b.name}
              </PlayerLink>
              <span className="ml-1.5 text-[10px] text-ink-3">{b.pos}</span>
            </span>
          ),
          cells: compact ? batMiniCells(b) : batCells(b),
        }))}
      />
      <StatTable
        compact={compact}
        caption={`${team.abbr} PITCHING`}
        columns={compact ? PIT_MINI : PIT_COLS}
        rows={team.pitchers.map((p) => ({
          key: p.id,
          label: (
            <span>
              <PlayerLink id={p.id} headshot={!compact}>
                {compact ? shortName(p.name) : p.name}
              </PlayerLink>
              {p.decision &&
                decisions(p.decision).map((d) => (
                  <span
                    key={d}
                    className={`ml-1.5 text-[10px] ${
                      isBad(d) ? "text-crit" : "text-accent"
                    }`}
                  >
                    {d}
                  </span>
                ))}
            </span>
          ),
          cells: compact ? pitMiniCells(p) : pitCells(p),
        }))}
      />
    </div>
  );
}

/* ── Page shell ──────────────────────────────────────────────────────── */

/** Both clubs' batting and pitching lines, one club at a time. Its own export
 *  because on a live game it is a tab rather than the body of the card. */
export function FullBox({ box }: { box: BoxScore }) {
  const [side, setSide] = useState<"away" | "home">("away");
  return (
    <div className="space-y-2">
      <SegmentedControl
        ariaLabel="Team"
        value={side}
        onChange={setSide}
        options={[
          { value: "away" as const, label: box.away.abbr },
          { value: "home" as const, label: box.home.abbr },
        ]}
      />
      <TeamLines team={side === "away" ? box.away : box.home} />
    </div>
  );
}

/** The gamecast's own box score: the same lines, in the columns a 28rem rail
 *  can hold, with the way through to the full one under them. */
export function MiniBox({ box, pk }: { box: BoxScore; pk: number }) {
  const [side, setSide] = useState<"away" | "home">("away");
  return (
    <Panel
      title="BOX SCORE"
      right={
        <SegmentedControl
          ariaLabel="Team"
          value={side}
          onChange={setSide}
          options={[
            { value: "away" as const, label: box.away.abbr },
            { value: "home" as const, label: box.home.abbr },
          ]}
        />
      }
    >
      <TeamLines team={side === "away" ? box.away : box.home} compact />
      <Link
        href={`/game/${pk}?tab=box`}
        className="mt-2 block border border-line px-2 py-1.5 text-center text-[10px] tracking-[0.2em] text-ink-3 hover:border-accent hover:text-ink"
      >
        FULL BOX SCORE
      </Link>
    </Panel>
  );
}

/** A game with cards posted but no pitch thrown — the lines are all zeros, so
 *  the two probables read better than a table of them. */
export function NoBoxYet({ game }: { game: Game }) {
  return (
    <div className="border border-line px-3 py-6 text-center">
      <p className="text-xs text-ink-3">NOT STARTED — NO BOX SCORE YET</p>
      <p className="mt-2 text-[11px] text-ink-2">
        <PlayerLink id={game.away.probable?.id}>
          {game.away.probable?.name ?? "TBA"}
        </PlayerLink>
        <span className="mx-2 text-ink-3">vs</span>
        <PlayerLink id={game.home.probable?.id}>
          {game.home.probable?.name ?? "TBA"}
        </PlayerLink>
      </p>
    </div>
  );
}

function HeaderSide({ side }: { side: Game["away"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogo(side.id)} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink">
          {side.abbr !== "—" ? side.abbr : side.name}
        </p>
        {side.wins !== null && (
          <p className="text-[10px] text-ink-3">
            {side.wins}-{side.losses}
          </p>
        )}
      </div>
      <span className="ml-1 text-xl tabular-nums text-ink">{side.score ?? "—"}</span>
    </div>
  );
}

export default function BoxScoreView({
  game,
  box,
  children,
}: {
  game: Game;
  box: BoxScore;
  /** What sits under the line score — the box score, or nothing on a game
   *  whose sections the page puts behind its own tabs. */
  children?: React.ReactNode;
}) {
  const st = gameStatus(game, useTimeZone());
  const tone =
    st.tone === "live" ? "text-good" : st.tone === "final" ? "text-ink-3" : "text-accent";

  return (
    <div className="border border-line bg-surface">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <HeaderSide side={game.away} />
          <span className="text-[10px] text-ink-3">@</span>
          <HeaderSide side={game.home} />
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-[10px] tracking-widest ${tone}`}>
            {st.tone === "live" && (
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
            )}
            {st.text}
          </p>
          {game.venue && (
            <p className="hidden text-[10px] text-ink-3 sm:block">{game.venue}</p>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="space-y-2 p-3">
        <Linescore box={box} game={game} />
        {children}
      </div>
    </div>
  );
}
