"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SortHeader from "@/components/ui/SortHeader";
import TeamLink from "@/components/mlb/TeamLink";
import { sortRows, toggleSort, type Sort } from "@/lib/sortTable";
import { teamStatNum, teamStatText, type TeamStatTable } from "@/lib/mlb";

/*
 * Season hitting and pitching lines for all 30 clubs, split by a segmented
 * toggle the same way Leaderboards splits its categories. Every stat column
 * sorts most → least on first click; the team column is the hyperlink through
 * to that club's own page.
 *
 * Sort state is keyed per group, so flipping to PITCHING doesn't try to sort
 * by a hitting column that isn't in the table.
 *
 * Which group is showing lives in the URL rather than in state, so a reload
 * lands back on the table you were reading — and the link you send someone
 * opens on it too. Anything but "pitching" reads as hitting, so a hand-edited
 * value can't produce an empty table.
 */

const DEFAULT_SORT: Record<"hitting" | "pitching", Sort> = {
  hitting: { key: "ops", dir: "desc" },
  pitching: { key: "era", dir: "asc" },
};

export default function TeamStats({ tables }: { tables: TeamStatTable[] }) {
  const router = useRouter();
  const group =
    useSearchParams().get("group") === "pitching" ? "pitching" : "hitting";
  const [sorts, setSorts] = useState(DEFAULT_SORT);

  const table = tables.find((t) => t.group === group);
  const sort = sorts[group];

  const rows = useMemo(() => {
    if (!table) return [];
    return sortRows(table.rows, sort.dir, (r) => teamStatNum(r.values[sort.key]));
  }, [table, sort]);

  const onSort = (key: string) =>
    setSorts((s) => ({ ...s, [group]: toggleSort(s[group], key) }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <SegmentedControl<"hitting" | "pitching">
          ariaLabel="Stat group"
          value={group}
          onChange={(g) => router.replace(`?group=${g}`, { scroll: false })}
          options={[
            { value: "hitting", label: "HITTING" },
            { value: "pitching", label: "PITCHING" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO TEAM {group.toUpperCase()} STATS FOR THIS SEASON YET
        </p>
      ) : (
        <div className="overflow-x-auto border border-line bg-bg">
          <table className="w-full min-w-[60rem] text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-1.5 text-left text-[10px] tracking-widest font-normal text-ink-3"
                >
                  TEAM
                </th>
                {table!.columns.map((c) => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    sortKey={c.key}
                    sort={sort}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="group border-t border-grid text-ink-2 hover:bg-surface-2"
                >
                  {/* The frozen team column repaints with the row it belongs
                      to — its own background would otherwise mask the hover. */}
                  <td className="sticky left-0 z-10 bg-bg px-3 py-1.5 group-hover:bg-surface-2">
                    <TeamLink id={r.id} name={r.name} />
                  </td>
                  {table!.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        sort.key === c.key ? "font-bold text-ink" : ""
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
      )}
    </div>
  );
}
