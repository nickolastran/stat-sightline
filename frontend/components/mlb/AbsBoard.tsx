"use client";

import { useEffect, useMemo, useState } from "react";
import SortHeader from "@/components/ui/SortHeader";
import Glossary from "@/components/mlb/Glossary";
import TeamLink from "@/components/mlb/TeamLink";
import PlayerLink from "@/components/mlb/PlayerLink";
import { teamLogo } from "@/lib/mlb";
import { sortRows, toggleSort, type Sort } from "@/lib/sortTable";
import { isTeamBoard, type AbsRow, type AbsType } from "@/lib/abs";

/*
 * One ABS challenge board — a club or a player per row, its challenges, and
 * how many of them beat what an average challenger would have got out of the
 * same calls.
 *
 * Built here rather than on DataTable because the rank column is a property
 * of the sort rather than of a row: #1 is whoever leads the column the reader
 * is currently sorting by, so it can only be numbered after the sort runs.
 * The board arrives whole (thirty clubs, five hundred hitters at the outside),
 * so the search box and the page both work on rows already in hand — nothing
 * here goes back to the server.
 *
 * The two "vs expected" columns are shaded rather than just signed: they are
 * the point of the table, and a column of ±numbers all reads the same at a
 * glance. Everything else is plain, so the shading means one thing.
 */

/** Rows added per click of the button under the table. */
const PAGE = 50;

/* Red over the league average, blue under — scaled against the biggest swing
   on the board, so the strongest cell is always fully saturated whether the
   season is a week or a year old. Shading goes on the cell itself: a padded
   span inside it would sit a hairline short of the row's edges. */
function heat(value: number, max: number): React.CSSProperties | undefined {
  if (!value || !max) return undefined;
  const alpha = (Math.min(Math.abs(value) / max, 1) * 0.55).toFixed(2);
  const rgb = value > 0 ? "198, 45, 45" : "38, 104, 201";
  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

const pct = (v: number | null, digits = 0) =>
  v === null ? "—" : `${(v * 100).toFixed(digits)}%`;

/** A signed figure, so a column of them reads as a difference, not a total. */
const signed = (v: number, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

/** The stat columns, in table order. `width` is the colgroup track. */
const COLUMNS: {
  key: keyof AbsRow;
  label: string;
  title: string;
  width: string;
  text: (r: AbsRow) => string;
  /** Set on the two shaded columns — the max is computed per board. */
  heat?: boolean;
}[] = [
  {
    key: "netOvr", label: "NET", width: "w-16", heat: true,
    title: "Overturns above the number an average challenger wins on the same calls",
    text: (r) => signed(r.netOvr),
  },
  {
    key: "netRuns", label: "RUNS", width: "w-16", heat: true,
    title: "Run value gained by those challenges, above expected",
    text: (r) => signed(r.netRuns),
  },
  { key: "chal", label: "CHAL", width: "w-14", title: "Challenges used", text: (r) => String(r.chal) },
  { key: "won", label: "WON", width: "w-14", title: "Challenges that overturned the call", text: (r) => String(r.won) },
  { key: "lost", label: "LOST", width: "w-14", title: "Challenges that confirmed the call", text: (r) => String(r.lost) },
  { key: "wonPct", label: "WON%", width: "w-14", title: "Share of challenges overturned", text: (r) => pct(r.wonPct) },
  { key: "kFlip", label: "+K", width: "w-12", title: "Strikeouts gained by an overturn", text: (r) => String(r.kFlip) },
  { key: "bbFlip", label: "−BB", width: "w-12", title: "Walks erased by an overturn", text: (r) => String(r.bbFlip) },
  { key: "rate", label: "RATE", width: "w-14", title: "Challenges per challengeable take", text: (r) => pct(r.rate, 1) },
  {
    key: "xRate", label: "xRATE", width: "w-14",
    title: "Challenge rate an average challenger would have run in the same spots",
    text: (r) => pct(r.xRate, 1),
  },
  {
    key: "rateDiff", label: "±RATE", width: "w-14",
    title: "Challenge rate above or below that expectation, in points",
    text: (r) => (r.rateDiff === null ? "—" : signed(r.rateDiff * 100)),
  },
  {
    key: "rsnOpp", label: "OPP", width: "w-14",
    title: "Takes worth challenging — the call went against the taking side",
    text: (r) => String(r.rsnOpp),
  },
  { key: "rsnChal", label: "RSN", width: "w-14", title: "Those opportunities that were actually challenged", text: (r) => String(r.rsnChal) },
  { key: "pctRsn", label: "%RSN", width: "w-14", title: "Share of challenges that were worth making", text: (r) => pct(r.pctRsn) },
  { key: "pctTaken", label: "%OPP", width: "w-14", title: "Share of worthwhile opportunities taken", text: (r) => pct(r.pctTaken) },
];

const GLOSSARY = [
  { label: "RK", title: "Position on the board as it is currently sorted" },
  ...COLUMNS.map((c) => ({ label: c.label, title: c.title })),
];

export default function AbsBoard({
  rows,
  type,
}: {
  rows: AbsRow[];
  type: AbsType;
}) {
  const teams = isTeamBoard(type);
  const [sort, setSort] = useState<Sort>({ key: "netOvr", dir: "desc" });
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);

  /* A new board arrives as new props on the same component — its rows have
     nothing to do with how far down the last one the reader had got. */
  useEffect(() => setVisible(PAGE), [rows, query]);

  const max = useMemo(
    () => ({
      netOvr: Math.max(1, ...rows.map((r) => Math.abs(r.netOvr))),
      netRuns: Math.max(1, ...rows.map((r) => Math.abs(r.netRuns))),
    }),
    [rows],
  );

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
      <div className="flex justify-end">
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
            <col className="w-10" />
            {COLUMNS.map((c) => (
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
                className="sticky top-0 z-10 border-b border-line border-l border-grid bg-surface px-3 py-1.5 text-[10px] font-normal tracking-widest text-ink-3"
              >
                <span className="sr-only">Team</span>
              </th>
              {COLUMNS.map((c, i) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  title={c.title}
                  sortKey={c.key}
                  sort={sort}
                  onSort={(k) => setSort((s) => toggleSort(s, k))}
                  align="right"
                  className={`sticky top-0 z-10 ${i === 0 ? "border-l border-grid" : ""}`}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-3 py-6 text-center text-ink-3"
                >
                  {query ? "NOBODY BY THAT NAME ON THIS BOARD" : "NO ABS CHALLENGES ON THIS BOARD"}
                </td>
              </tr>
            )}
            {shown.map((r, i) => (
              <tr
                key={r.id}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">
                  {i + 1}
                </td>
                <td className="overflow-hidden px-3 py-1.5 whitespace-nowrap text-ink-2">
                  {teams ? (
                    <TeamLink id={r.id} name={r.name} logo={false} />
                  ) : (
                    <PlayerLink id={r.id} headshot={false}>
                      {r.name}
                    </PlayerLink>
                  )}
                </td>
                <td className="border-l border-grid px-3 py-1.5">
                  {r.teamId !== null && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={teamLogo(teams ? r.id : r.teamId)}
                      alt={r.teamAbbr ?? ""}
                      title={r.teamAbbr ?? ""}
                      width={18}
                      height={18}
                      loading="lazy"
                      className="h-[18px] w-[18px]"
                    />
                  )}
                </td>
                {COLUMNS.map((c, j) => {
                  const value = r[c.key];
                  return (
                    <td
                      key={c.key}
                      style={
                        c.heat && typeof value === "number"
                          ? heat(value, max[c.key as "netOvr" | "netRuns"])
                          : undefined
                      }
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        j === 0 ? "border-l border-grid" : ""
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
