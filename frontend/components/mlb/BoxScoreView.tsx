"use client";

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
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";

/*
 * Full box score for one game: linescore plus each team's batting and
 * pitching lines. Both payloads are fetched server-side by /game/[pk] and
 * passed in whole; this is a client component only because the team toggle
 * and the local-timezone first-pitch label need the browser.
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

/* A pitcher's note can carry more than one decision — "(W, 3-6)(BS, 6)". A
   loss or a blown save is a bad outcome, so it reads red instead of the accent
   the earned decisions use. */
const decisions = (note: string) => note.match(/\([^)]*\)/g) ?? [note];
const isBad = (d: string) => /^\((L|BS)\b/.test(d);

/* ── Linescore ───────────────────────────────────────────────────────── */

function Linescore({ box, final }: { box: BoxScore; final: boolean }) {
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
                className="w-7 px-1 py-1.5 text-center text-[10px] text-ink-3 tabular-nums"
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
                // A home team that never had to bat gets an X, the scorecard
                // convention — but only once the game is over; mid-game the
                // half simply hasn't happened yet.
                const blank = inn && final ? "X" : "";
                return (
                  <td
                    key={n}
                    className="px-1 py-1.5 text-center tabular-nums text-ink-2"
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
}: {
  caption: string;
  columns: readonly string[];
  rows: { key: number; label: React.ReactNode; cells: (string | number)[] }[];
}) {
  return (
    <div className="overflow-x-auto border border-line">
      {/* Fixed layout with one width for every stat column: the numbers land in
          the same place in both tables and don't shift as content changes. */}
      <table className="w-full min-w-[44rem] table-fixed border-collapse text-xs">
        <colgroup>
          <col />
          {columns.map((c) => (
            <col key={c} className="w-14" />
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
                className="px-2 py-1 text-right text-[10px] tracking-widest text-ink-3"
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
                  className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-ink-2"
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

function TeamLines({ team }: { team: BoxTeam }) {
  return (
    <div className="space-y-2">
      <StatTable
        caption={`${team.abbr} BATTING`}
        columns={BAT_COLS}
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
              <PlayerLink id={b.id}>{b.name}</PlayerLink>
              <span className="ml-1.5 text-[10px] text-ink-3">{b.pos}</span>
            </span>
          ),
          cells: batCells(b),
        }))}
      />
      <StatTable
        caption={`${team.abbr} PITCHING`}
        columns={PIT_COLS}
        rows={team.pitchers.map((p) => ({
          key: p.id,
          label: (
            <span>
              <PlayerLink id={p.id}>{p.name}</PlayerLink>
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
          cells: pitCells(p),
        }))}
      />
    </div>
  );
}

/* ── Page shell ──────────────────────────────────────────────────────── */

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
  right,
}: {
  game: Game;
  box: BoxScore;
  /** Header slot for the page's own chrome (the gameday ↗ link). */
  right?: React.ReactNode;
}) {
  const [side, setSide] = useState<"away" | "home">("away");
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
        {right}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="space-y-2 p-3">
        <Linescore box={box} final={game.state === "Final"} />
        {box.away.batters.length === 0 && box.home.batters.length === 0 ? (
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
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
