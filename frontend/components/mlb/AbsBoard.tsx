"use client";

import { useEffect, useMemo, useState } from "react";
import SortHeader from "@/components/ui/SortHeader";
import Glossary from "@/components/mlb/Glossary";
import TeamLink from "@/components/mlb/TeamLink";
import PlayerLink from "@/components/mlb/PlayerLink";
import { heat, teamLogo } from "@/lib/mlb";
import { sortRows, toggleSort, type Sort } from "@/lib/sortTable";
import { isTeamBoard, type AbsBoard as Board, type AbsRow, type AbsType } from "@/lib/abs";

/*
 * One ABS challenge board — a club or a player per row, laid out the way
 * Savant's own board is: what the challenges were worth in runs against what
 * an average challenger gets out of the same calls, then the run value there
 * was to take and how much of it was taken, then the same two reads in plain
 * overturns, then the strikeouts and walks an overturn turned around. SHOW
 * MORE COLUMNS opens the expected figures each "vs. expected" comes from.
 *
 * Built here rather than on DataTable because the rank column is a property
 * of the sort rather than of a row: #1 is whoever leads the column the reader
 * is currently sorting by, so it can only be numbered after the sort runs.
 * The board arrives whole (thirty clubs, five hundred hitters at the outside),
 * so the search box, the page and the extra columns all work on rows already
 * in hand — nothing here goes back to the server.
 *
 * Three columns are shaded, the ones Savant shades: RUNS ABOVE AVG. away from
 * zero, and the two "% taken" columns away from the league's own share, so
 * red is more than the league takes and blue less. Everything else is plain,
 * so the shading means one thing.
 *
 * The league's own line is pinned above the board on the same slice of
 * pitches, so every figure below it has something to be read against. It is
 * outside the sort, the rank and the search on purpose — it is the baseline,
 * not a competitor for first place.
 */

/** Rows added per click of the button under the table. */
const PAGE = 50;

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const runs = (v: number) => v.toFixed(1);

/** A signed figure, so a column of them reads as a difference, not a total. */
const signed = (v: number, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

type Column = {
  key: keyof AbsRow;
  label: string;
  title: string;
  /** The colgroup track. */
  width: string;
  text: (r: AbsRow) => string;
  /** Shaded: away from zero, or away from the league's own figure. */
  heat?: "zero" | "league";
  /** Only under SHOW MORE COLUMNS. */
  more?: true;
  /** Opens a group, behind a rule. */
  edge?: true;
};

/** The stat columns, in table order. */
const COLUMNS: Column[] = [
  {
    key: "raa", label: "RUNS ABOVE AVG.", width: "w-20", heat: "zero", edge: true,
    title: "Run value of the challenges above what an average challenger gets on the same calls: gain vs. expected plus cost value vs. expected",
    text: (r) => signed(r.raa),
  },
  { key: "runsGained", label: "RUNS GAINED", width: "w-16", title: "Run value won back by successful challenges", text: (r) => runs(r.runsGained) },
  { key: "runsCost", label: "RUNS COST", width: "w-16", title: "Run value given up by failed challenges", text: (r) => runs(r.runsCost) },
  { key: "xRunsGained", label: "xRUNS GAINED", width: "w-16", more: true, title: "Runs an average challenger gains on the same calls", text: (r) => runs(r.xRunsGained) },
  { key: "xRunsCost", label: "xRUNS COST", width: "w-16", more: true, title: "Runs an average challenger costs on the same calls", text: (r) => runs(r.xRunsCost) },
  { key: "gainVsExp", label: "GAIN VS. EXP.", width: "w-16", more: true, title: "Runs gained above expected", text: (r) => signed(r.gainVsExp) },
  { key: "costVsExp", label: "COST VALUE VS. EXP.", width: "w-20", more: true, title: "Runs cost below expected — positive is cheaper than average", text: (r) => signed(r.costVsExp) },
  {
    key: "possRuns", label: "POSS. RUNS", width: "w-16",
    title: "Run value of every wrong call against this side while it still had a challenge",
    text: (r) => runs(r.possRuns),
  },
  { key: "pctRunsTaken", label: "% RUNS TAKEN", width: "w-16", heat: "league", title: "Share of those possible runs actually won back", text: (r) => pct(r.pctRunsTaken) },
  { key: "runsNotTaken", label: "RUNS NOT TAKEN", width: "w-16", title: "Possible runs left on the table", text: (r) => runs(r.runsNotTaken) },
  { key: "chal", label: "CHAL", width: "w-14", edge: true, title: "Challenges made", text: (r) => String(r.chal) },
  { key: "won", label: "WON", width: "w-14", title: "Challenges that overturned the call", text: (r) => String(r.won) },
  { key: "lost", label: "LOST", width: "w-14", title: "Challenges that confirmed the call", text: (r) => String(r.lost) },
  { key: "wonPct", label: "WON%", width: "w-14", title: "Share of challenges overturned", text: (r) => pct(r.wonPct) },
  { key: "xChal", label: "xCHAL", width: "w-14", more: true, title: "Challenges an average challenger makes in the same spots", text: (r) => runs(r.xChal) },
  { key: "xWon", label: "xWON", width: "w-14", more: true, title: "Overturns an average challenger wins on the same calls", text: (r) => runs(r.xWon) },
  { key: "xLost", label: "xLOST", width: "w-14", more: true, title: "Failed challenges an average challenger makes on the same calls", text: (r) => runs(r.xLost) },
  { key: "xWonPct", label: "xWON%", width: "w-14", more: true, title: "Expected share of challenges overturned", text: (r) => pct(r.xWonPct) },
  { key: "wonVsExp", label: "WON VS. EXP.", width: "w-16", more: true, title: "Overturns above expected", text: (r) => signed(r.wonVsExp) },
  { key: "lostVsExp", label: "LOST VS. EXP.", width: "w-16", more: true, title: "Failed challenges above expected — negative is better", text: (r) => signed(r.lostVsExp) },
  {
    key: "possOvr", label: "POSS. OVR.", width: "w-16", edge: true,
    title: "Wrong calls against this side while it still had a challenge",
    text: (r) => String(r.possOvr),
  },
  { key: "pctOvrTaken", label: "% OVR. TAKEN", width: "w-16", heat: "league", title: "Share of those possible overturns actually won", text: (r) => pct(r.pctOvrTaken) },
  { key: "ovrNotTaken", label: "OVR. NOT TAKEN", width: "w-16", title: "Possible overturns left unchallenged", text: (r) => String(r.ovrNotTaken) },
  { key: "kFlip", label: "K FLIP", width: "w-14", edge: true, title: "Strikeouts an overturn turned around", text: (r) => String(r.kFlip) },
  { key: "bbFlip", label: "BB FLIP", width: "w-14", title: "Walks an overturn turned around", text: (r) => String(r.bbFlip) },
];

const GLOSSARY = [
  { label: "RK", title: "Position on the board as it is currently sorted" },
  ...COLUMNS.map((c) => ({ label: c.label, title: c.title })),
];

export default function AbsBoard({
  board,
  type,
}: {
  board: Board;
  type: AbsType;
}) {
  const { rows, league } = board;
  const teams = isTeamBoard(type);
  /* GROUP BY splits every club or player into several rows; the column only
     exists when there is something in it. */
  const split = rows.some((r) => r.split !== null);
  const [sort, setSort] = useState<Sort>({ key: "raa", dir: "desc" });
  const [more, setMore] = useState(false);
  const cols = COLUMNS.filter((c) => more || !c.more);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);

  /* A new board arrives as new props on the same component — its rows have
     nothing to do with how far down the last one the reader had got. */
  useEffect(() => setVisible(PAGE), [rows, query]);

  /* Each shaded column's reference point, and the furthest any row sits from
     it — the shade is a share of that. A % column with no league line to
     read against goes plain. */
  const shade = useMemo(() => {
    const out = new Map<keyof AbsRow, { at: number; max: number }>();
    for (const c of COLUMNS) {
      if (!c.heat) continue;
      const base = c.heat === "zero" ? 0 : league?.[c.key];
      if (typeof base !== "number") continue;
      const gaps = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number");
      out.set(c.key, { at: base, max: Math.max(...gaps.map((v) => Math.abs(v - base)), 1e-9) });
    }
    return out;
  }, [rows, league]);

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.teamAbbr ?? "").toLowerCase().includes(q),
        )
      : rows;
    return sortRows(found, sort.dir, (r) => {
      const v = r[sort.key as keyof AbsRow];
      return typeof v === "number" || typeof v === "string" ? v : null;
    });
  }, [rows, query, sort]);

  const shown = ranked.slice(0, visible);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="border border-line bg-bg px-2 py-1 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink"
        >
          {more ? "HIDE MORE COLUMNS" : "SHOW MORE COLUMNS"}
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={teams ? "SEARCH TEAM" : "SEARCH PLAYER"}
          aria-label={teams ? "Search teams" : "Search players"}
          className="w-56 border border-line bg-bg px-2 py-1 text-[10px] tracking-wider text-ink placeholder:text-ink-3 hover:border-accent focus:border-accent focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto border border-line">
        {/* Fixed layout, so a column's width is declared here rather than set
            by whatever the widest cell in it happens to be — reversing a sort
            swaps a long name for a short one and every heading on the row
            would otherwise shift. Left-over width spreads across these same
            tracks, so the board still fills the panel. */}
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-10" />
            <col className="w-48" />
            <col className="w-16" />
            {split && <col className="w-24" />}
            {cols.map((c) => (
              <col key={c.key} className={c.width} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-1.5 text-right text-[10px] font-normal tracking-widest text-ink-3"
              >
                RK
              </th>
              <SortHeader
                label={teams ? "TEAM" : "PLAYER"}
                sortKey="name"
                sort={sort}
                onSort={(k) => setSort((s) => toggleSort(s, k))}
                align="left"
                className="sticky top-0 z-10"
              />
              {/* The mark, in its own column behind a rule: the name is the
                  link you read, the logo is the club you scan for. */}
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-line border-l border-grid bg-surface px-3 py-1.5 text-left text-[10px] font-normal tracking-widest text-ink-3"
              >
                TEAM
              </th>
              {split && (
                <SortHeader
                  label="SPLIT"
                  title="Which slice of the board this row is"
                  sortKey="split"
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                  align="left"
                  className="sticky top-0 z-10"
                />
              )}
              {cols.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  title={c.title}
                  sortKey={c.key}
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                  align="right"
                  className={`sticky top-0 z-10 align-bottom ${c.edge ? "border-l border-grid" : ""}`}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length + (split ? 4 : 3)}
                  className="px-3 py-6 text-center text-ink-3"
                >
                  {query ? "NOBODY BY THAT NAME ON THIS BOARD" : "NO ABS CHALLENGES ON THIS BOARD"}
                </td>
              </tr>
            )}
            {league && (
              /* The baseline, above the sort and outside the rank: every
                 challenge on this slice, whoever made it. */
              <tr className="border-b border-line bg-surface-2/60 font-bold text-ink">
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-3">
                  LEAGUE
                </td>
                <td className="border-l border-grid px-3 py-1.5" />
                {split && <td className="px-3 py-1.5" />}
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      c.edge ? "border-l border-grid" : ""
                    }`}
                  >
                    {c.text(league)}
                  </td>
                ))}
              </tr>
            )}
            {shown.map((r, i) => (
              <tr
                key={r.key}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">
                  {i + 1}
                </td>
                <td className="overflow-hidden px-3 py-1.5 whitespace-nowrap text-ink-2">
                  {teams ? (
                    <TeamLink id={r.id} name={r.name} logo={false} />
                  ) : (
                    <PlayerLink id={r.id}>{r.name}</PlayerLink>
                  )}
                </td>
                <td className="border-l border-grid px-3 py-1.5">
                  {(teams || r.teamId !== null) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={teamLogo(teams ? r.id : r.teamId!)}
                      alt={r.teamAbbr ?? ""}
                      title={r.teamAbbr ?? ""}
                      width={18}
                      height={18}
                      loading="lazy"
                      className="h-[18px] w-[18px]"
                    />
                  )}
                </td>
                {split && (
                  <td className="overflow-hidden px-3 py-1.5 text-[10px] tracking-wider whitespace-nowrap text-ink-3">
                    {r.split ?? "—"}
                  </td>
                )}
                {cols.map((c) => {
                  const value = r[c.key];
                  const s = shade.get(c.key);
                  return (
                    <td
                      key={c.key}
                      style={
                        s && typeof value === "number" ? heat(value - s.at, s.max) : undefined
                      }
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        c.edge ? "border-l border-grid" : ""
                      } ${c.heat ? "font-bold text-ink" : "text-ink-2"}`}
                    >
                      {c.text(r)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible < ranked.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE)}
          className="block w-full py-1 text-center text-[10px] tracking-[0.2em] text-accent hover:underline"
        >
          SHOW MORE +{Math.min(PAGE, ranked.length - visible)}
        </button>
      )}

      <Glossary entries={GLOSSARY} />
    </div>
  );
}
