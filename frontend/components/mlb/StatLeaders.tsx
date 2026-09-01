"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { useSetParam } from "@/lib/useSetParam";
import { moreStatLeaders } from "@/app/league/[section]/leaders";
import {
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
        <table className="w-full border-collapse text-xs">
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
                    aria-sort={active ? "descending" : undefined}
                    className={`sticky top-0 z-10 border-b border-line p-0 text-right ${
                      active ? "bg-accent/15" : "bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      title={c.title}
                      onClick={() => startSort(() => setParam("stat", c.key))}
                      className={`w-full px-3 py-2 text-right text-[10px] tracking-widest ${
                        active ? "text-ink" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      {c.label}
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
                <td className="px-3 py-1.5 whitespace-nowrap">
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
