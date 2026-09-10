"use client";

import { useState } from "react";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { teamLogo, teamStatNum, teamStatText } from "@/lib/mlb";
import { sortRows, type Sort } from "@/lib/sortTable";
import { colGroups, type AdvBoard, type ViewCol } from "@/lib/advanced";

/*
 * One advanced board — forty-odd columns of things the standard line doesn't
 * carry, banded by where they come from.
 *
 * Unlike the standard player table, the sort happens here rather than
 * upstream: MLB can rank its own stats but not FanGraphs' or Savant's, and
 * the qualified pool is a couple of hundred rows, so the whole board is
 * already in hand. Clicking a heading reorders what is on screen instead of
 * asking anyone for a differently-ordered fifty.
 *
 * The first click on a column takes its good end first — most barrels, but
 * lowest FIP — which is what "who leads this" means either way. A second
 * click reverses it.
 */

/** Which way a column reads best first — the direction a first click takes. */
const bestFirst = (c: ViewCol): "asc" | "desc" => c.best ?? "desc";

/* The rank and name columns stay put while the figures scroll under them —
   forty columns in, a row of numbers with no name on it is unreadable. The
   backgrounds are opaque so the scrolled cells pass behind rather than
   through. */
const STUCK_RANK = "sticky left-0 z-20 bg-bg";
const STUCK_NAME = "sticky left-10 z-20 bg-bg";
const STUCK_HEAD_RANK = "sticky left-0 z-30 bg-surface";
const STUCK_HEAD_NAME = "sticky left-10 z-30 bg-surface";

export default function AdvancedTable({
  board,
  /** Which column the page arrived sorted by, when a card linked into it. */
  initial,
}: {
  board: AdvBoard;
  initial?: string;
}) {
  const first =
    board.columns.find((c) => c.key === initial) ?? board.columns[0];
  const [sort, setSort] = useState<Sort | null>(
    first ? { key: first.key, dir: bestFirst(first) } : null,
  );

  const active = board.columns.find((c) => c.key === sort?.key);
  const rows = sort
    ? sortRows(board.rows, sort.dir, (r) => teamStatNum(r.values[sort.key]))
    : board.rows;

  const onSort = (c: ViewCol) =>
    setSort((s) =>
      s?.key === c.key
        ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key: c.key, dir: bestFirst(c) },
    );

  const bands = colGroups(board.columns);
  /* A club has no position, so that heading would be a column of dashes. */
  const pos = board.rows.some((r) => r.position);
  const lead = pos ? ["RK", "NAME", "POS"] : ["RK", "NAME"];

  return (
    <div className="space-y-2">
      <div className="overflow-auto border border-line" style={{ maxHeight: "42rem" }}>
        <table className="border-collapse text-xs whitespace-nowrap">
          <thead>
            {/* The band row names where a run of columns comes from, so a
                reader meeting xwOBA∆ knows it is Savant's and not MLB's. */}
            <tr>
              <th
                colSpan={lead.length}
                className={`${STUCK_HEAD_RANK} top-0 z-40 border-b border-r border-line px-3 py-1 text-left text-[10px] font-normal tracking-[0.2em] text-ink-3`}
              >
                &nbsp;
              </th>
              {bands.map((b) => (
                <th
                  key={b.label}
                  colSpan={b.span}
                  scope="colgroup"
                  className="sticky top-0 z-10 border-b border-r border-line bg-surface-2 px-3 py-1 text-center text-[10px] font-normal tracking-[0.2em] text-ink-2 last:border-r-0"
                >
                  {b.label}
                </th>
              ))}
            </tr>
            <tr>
              {lead.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`${i === 0 ? STUCK_HEAD_RANK : i === 1 ? STUCK_HEAD_NAME : "bg-surface"} sticky top-[25px] z-30 border-b border-line px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                    i === 1 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
              {board.columns.map((c) => {
                const on = c.key === sort?.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      on
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`sticky top-[25px] z-10 border-b border-line p-0 text-right ${
                      on ? "bg-accent/15" : "bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      title={on ? `${c.title} — click to reverse` : c.title}
                      onClick={() => onSort(c)}
                      className={`w-full px-3 py-2 text-right text-[10px] tracking-widest ${
                        on ? "text-ink" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      {/* The marker hangs in the cell padding so the label
                          stays over its own numbers on a sort. */}
                      <span className="relative inline-block -mr-[0.1em]">
                        {c.label}
                        <span className="absolute top-1/2 left-full w-2.5 -translate-y-1/2 text-center text-[11px] leading-none">
                          {on ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
                        </span>
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={board.columns.length + lead.length}
                  className="px-3 py-6 text-center text-ink-3"
                >
                  NOTHING TRACKED FOR THIS SEASON
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr
                key={`${r.id}-${r.position}`}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td
                  className={`${STUCK_RANK} px-3 py-1.5 text-right tabular-nums text-ink-3`}
                >
                  {i + 1}
                </td>
                <td className={`${STUCK_NAME} px-3 py-1.5`}>
                  <span className="flex items-center gap-2">
                    {r.team ? (
                      <>
                        {r.teamId !== null && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={teamLogo(r.teamId)}
                            alt=""
                            width={18}
                            height={18}
                            loading="lazy"
                            className="h-[18px] w-[18px] shrink-0"
                          />
                        )}
                        <PlayerLink id={r.id} headshot={false}>
                          {r.name}
                        </PlayerLink>
                        <span className="text-[10px] tracking-wider text-ink-3">
                          <TeamLink id={r.teamId} name={r.team} logo={false} />
                        </span>
                      </>
                    ) : (
                      /* A club board's row is the club itself. */
                      <TeamLink id={r.teamId} name={r.name} />
                    )}
                  </span>
                </td>
                {pos && (
                  <td className="px-3 py-1.5 text-right text-[10px] tracking-wider text-ink-3">
                    {r.position || "—"}
                  </td>
                )}
                {board.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      c.key === sort?.key ? "bg-accent/10 text-ink" : "text-ink-2"
                    }`}
                  >
                    {teamStatText(r.values[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] tracking-wider text-ink-3">
        {board.note}
        {active ? ` Sorted by ${active.label} — ${active.title}.` : ""}
        {board.missing.length
          ? ` Savant's ${board.missing.join(" and ")} board is unavailable, so those columns are absent.`
          : ""}
      </p>
    </div>
  );
}
