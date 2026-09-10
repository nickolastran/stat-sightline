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
 *
 * ── The chrome, which is most of what is going on below ──
 *
 * A board this wide has to freeze two things at once: the headings, so a
 * column of numbers keeps its name, and the rank and player, so a row keeps
 * its owner. Three things follow from that, none of them optional:
 *
 *  - `border-separate`. A cell that sticks in both axes at once does not
 *    stick reliably in a `border-collapse` table — the corner and the two
 *    frozen columns scroll away under the body while the plain headings stay
 *    put. Separated borders behave, at the cost of every border being the
 *    cell's own: a `<tr>`'s border isn't painted at all in this mode, so the
 *    row rules live on the cells.
 *  - `table-fixed` and a colgroup. The frozen columns are offset by hand
 *    (`left-10` is the rank column's own width), so those widths have to be
 *    declared rather than left to whatever the longest name in the board
 *    happens to be.
 *  - Opaque backgrounds and a z-order, everywhere. A sticky cell has the
 *    table scrolling underneath it, so a tint over nothing shows the rows
 *    through the heading — which is why the sorted column's highlight sits on
 *    the button inside the cell and the cell itself stays solid.
 */

/** Which way a column reads best first — the direction a first click takes. */
const bestFirst = (c: ViewCol): "asc" | "desc" => c.best ?? "desc";

/*
 * The frozen columns. `left-10` is the rank column's declared width, so the
 * two meet exactly; the panel behind the table is white, so these are
 * `bg-surface` and not the page's own warm paper, which would print the
 * frozen pair as a grey block down the side of the board.
 *
 * The z-order runs body < headings < frozen headings, so the corner where
 * the two freezes cross covers both.
 */
const RANK_W = "w-10";
const NAME_W = "w-64";
const POS_W = "w-12";
const STAT_W = "w-16";

const FROZEN = "sticky bg-surface group-hover:bg-surface-2";
const FROZEN_HEAD = "sticky z-30 bg-surface";
const HEAD = "sticky z-20 bg-surface";
/** The band row's declared height, and so the offset the headings sit at. */
const BAND_H = "h-6";
const HEAD_TOP = "top-6";

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
      <div
        className="overflow-auto border border-line"
        style={{ maxHeight: "42rem" }}
      >
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-xs">
          <colgroup>
            <col className={RANK_W} />
            <col className={NAME_W} />
            {pos && <col className={POS_W} />}
            {board.columns.map((c) => (
              <col key={c.key} className={STAT_W} />
            ))}
          </colgroup>
          <thead>
            {/* The band row names where a run of columns comes from, so a
                reader meeting xwOBA∆ knows it is Savant's and not MLB's. */}
            <tr>
              <th
                colSpan={lead.length}
                className={`${FROZEN_HEAD} ${BAND_H} top-0 left-0 border-r border-b border-line`}
              >
                <span className="sr-only">Player</span>
              </th>
              {bands.map((b) => (
                <th
                  key={b.label}
                  colSpan={b.span}
                  scope="colgroup"
                  className={`${HEAD} ${BAND_H} top-0 border-r border-b border-line bg-surface-2 px-3 text-center text-[10px] font-normal tracking-[0.2em] text-ink-2 last:border-r-0`}
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
                  className={`${FROZEN_HEAD} ${HEAD_TOP} ${
                    i === 0 ? "left-0" : i === 1 ? "left-10" : ""
                  } border-b border-line px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                    i === 1 ? "text-left" : "text-right"
                  } ${i === lead.length - 1 ? "border-r border-line" : ""}`}
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
                    className={`${HEAD} ${HEAD_TOP} border-b border-line p-0 text-right`}
                  >
                    <button
                      type="button"
                      title={on ? `${c.title} — click to reverse` : c.title}
                      onClick={() => onSort(c)}
                      /* The highlight rides on the button rather than the
                         cell: the cell has to stay opaque or the rows scroll
                         through the heading. */
                      className={`w-full px-3 py-2 text-right text-[10px] tracking-widest ${
                        on
                          ? "bg-accent/15 text-ink"
                          : "text-ink-3 hover:text-ink"
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
              <tr key={`${r.id}-${r.position}`} className="group">
                <td
                  className={`${FROZEN} left-0 z-10 border-b border-grid px-3 py-1.5 text-right tabular-nums text-ink-3`}
                >
                  {i + 1}
                </td>
                <td
                  className={`${FROZEN} left-10 z-10 overflow-hidden border-b border-grid px-3 py-1.5 whitespace-nowrap ${
                    pos ? "" : "border-r border-line"
                  }`}
                >
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
                        {/* Club mark and face both, the way a leader card
                            reads — the mark says which team, the face is
                            what the eye picks the row out by. */}
                        <PlayerLink id={r.id}>{r.name}</PlayerLink>
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
                  <td className="border-r border-b border-line border-b-grid px-3 py-1.5 text-right text-[10px] tracking-wider text-ink-3 group-hover:bg-surface-2">
                    {r.position || "—"}
                  </td>
                )}
                {board.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border-b border-grid px-3 py-1.5 text-right tabular-nums group-hover:bg-surface-2 ${
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
