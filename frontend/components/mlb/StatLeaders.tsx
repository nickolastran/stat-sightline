"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { useSetParam } from "@/lib/useSetParam";
import { moreStatLeaders } from "@/app/league/[section]/leaders";
import {
  boardDir,
  teamLogo,
  teamStatText,
  type StatLeaderRow,
  type TeamStatCol,
} from "@/lib/mlb";

/*
 * The league's players in one group, ranked by one column. MLB does the
 * ranking, so picking a column is a navigation that re-asks for the right
 * fifty players — but SHOW ALL only ever adds to what is already on screen,
 * and the rows read so far never move.
 *
 * A first click on a column takes MLB's own order for that stat, which is best
 * first: most home runs, but lowest ERA. Clicking it again asks for the
 * opposite and walks the board down to the worst. Which way "opposite" runs is
 * read off the rows on screen rather than declared per stat, so a column MLB
 * ranks upside-down flips correctly without a table of exceptions here.
 */

/** One row's own fade — appended rows arrive rather than appear. */
const enter = (i: number) => ({
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, delay: (i % 50) * 0.012 },
});

export default function StatLeaders({
  columns,
  rows: first,
  total,
  stat,
  query,
  note,
}: {
  columns: TeamStatCol[];
  rows: StatLeaderRow[];
  /** Everyone who qualifies — what SHOW ALL fills in the rest of. */
  total: number;
  /** The column the board is ranked by, highlighted down the table. */
  stat: string;
  /** The slice these rows came from, which is what the next page continues. */
  query: {
    season: number;
    group: string;
    type: string;
    stat: string;
    league: string;
    position: string;
    order?: "asc" | "desc";
  };
  note: string;
}) {
  const setParam = useSetParam();
  const [sorting, startSort] = useTransition();
  const [rows, setRows] = useState(first);
  const [loading, setLoading] = useState(false);

  /* A new sort or filter arrives as new props on the same component — the
     appended pages belong to the slice that asked for them, not this one. */
  useEffect(() => setRows(first), [first]);

  /* Which way the board actually runs — the direction a second click flips. */
  const dir = boardDir(rows.map((r) => r.values[stat]));

  /* Same column again reverses it; a new column starts from MLB's order. */
  const sortBy = (key: string) =>
    startSort(() =>
      key === stat
        ? setParam({ order: dir === "desc" ? "asc" : "desc" })
        : setParam({ stat: key, order: null })
    );

  const showAll = async () => {
    setLoading(true);
    try {
      const rest = await moreStatLeaders({
        ...query,
        offset: rows.length,
        limit: total - rows.length,
      });
      setRows((r) => [...r, ...rest]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-2 ${sorting ? "opacity-60" : ""}`}>
      <div className="overflow-x-auto border border-line">
        <table className="w-full table-fixed border-collapse text-xs">
          {/*
           * Fixed layout, so a column's width comes from here and not from
           * whatever happens to be in it. Under the browser's own sizing the
           * widest cell sets the width, and reversing a column swaps 60 for 3
           * and a long name for a short one — every heading on the row shifts
           * a few pixels on a sort that was meant to change nothing but the
           * order. Any space left over is spread across these same widths, so
           * a ten-column board still fills the panel.
           */}
          <colgroup>
            <col className="w-10" />
            <col className="w-56" />
            <col className="w-10" />
            {columns.map((c) => (
              <col key={c.key} className="w-16" />
            ))}
          </colgroup>
          <thead>
            <tr>
              {["RK", "NAME", "POS"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                    i === 1 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
              {columns.map((c) => {
                const active = c.key === stat;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active
                        ? dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`sticky top-0 z-10 border-b border-line p-0 text-right ${
                      active ? "bg-accent/15" : "bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      title={
                        active
                          ? `${c.title} — click to reverse`
                          : c.title
                      }
                      onClick={() => sortBy(c.key)}
                      className={`w-full px-3 py-2 text-right text-[10px] tracking-widest ${
                        active ? "text-ink" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      {/* Marker hangs in the padding so the label stays over
                          its numbers, the same trick SortHeader uses. */}
                      <span className="relative inline-block -mr-[0.1em]">
                        {c.label}
                        <span className="absolute left-full top-1/2 ml-1 w-2.5 -translate-y-1/2 text-center text-[11px] leading-none">
                          {active ? (dir === "desc" ? "\u25bc" : "\u25b2") : ""}
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
                  colSpan={columns.length + 3}
                  className="px-3 py-6 text-center text-ink-3"
                >
                  NOBODY QUALIFIES ON THIS SLICE
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <motion.tr
                key={`${r.id}-${r.position}-${i}`}
                {...enter(i)}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">
                  {r.rank ?? "—"}
                </td>
                <td className="overflow-hidden px-3 py-1.5 whitespace-nowrap">
                  <span className="flex items-center gap-2">
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
                    {r.teamId !== null && (
                      <span className="text-[10px] tracking-wider text-ink-3">
                        <TeamLink id={r.teamId} name={r.team} logo={false} />
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-[10px] tracking-wider text-ink-3">
                  {r.position || "—"}
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      c.key === stat ? "bg-accent/10 text-ink" : "text-ink-2"
                    }`}
                  >
                    {teamStatText(r.values[c.key])}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length < total && (
        <button
          type="button"
          onClick={showAll}
          disabled={loading}
          className="block w-full py-1 text-center text-[10px] tracking-[0.2em] text-accent hover:underline disabled:opacity-50"
        >
          {loading ? "LOADING…" : "SHOW ALL"}
        </button>
      )}
      <p className="text-[10px] tracking-wider text-ink-3">{note}</p>
    </div>
  );
}
