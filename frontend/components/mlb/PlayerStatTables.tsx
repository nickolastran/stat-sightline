"use client";

import DataTable, { type Column } from "@/components/ui/DataTable";
import PlayerLink from "@/components/mlb/PlayerLink";
import Panel from "@/components/ui/Panel";
import {
  teamStatNum,
  teamStatText,
  type PlayerStatRow,
  type StatGroup,
  type TeamStatCol,
} from "@/lib/mlb";

/*
 * One club's players, a table per group. Client-side because the tables sort:
 * the columns carry render functions, which a server component can't hand
 * across, so the spec crosses as plain data and the columns are built here.
 *
 * Fielding is reported per position rather than per player, so a shortstop who
 * filled in at second has a row for each — which is also why the row key
 * carries the position.
 */

const TITLES: Record<StatGroup, string> = {
  hitting: "BATTING",
  pitching: "PITCHING",
  fielding: "FIELDING",
};

export default function PlayerStatTables({
  group,
  columns,
  rows,
  season,
}: {
  group: StatGroup;
  columns: TeamStatCol[];
  rows: PlayerStatRow[];
  season: number;
}) {
  const cols: Column<PlayerStatRow>[] = [
    {
      key: "player",
      label: "PLAYER",
      sortValue: (r) => r.name,
      render: (r) => <PlayerLink id={r.id}>{r.name}</PlayerLink>,
    },
    ...(group === "fielding"
      ? [
          {
            key: "position",
            label: "POS",
            sortValue: (r: PlayerStatRow) => r.position,
            render: (r: PlayerStatRow) => r.position || "—",
          },
        ]
      : []),
    ...columns.map(
      (c): Column<PlayerStatRow> => ({
        key: c.key,
        label: c.label,
        align: "right",
        sortValue: (r) => teamStatNum(r.values[c.key]),
        render: (r) => <span title={c.title}>{teamStatText(r.values[c.key])}</span>,
      })
    ),
  ];

  return (
    <Panel
      title={`${TITLES[group]} — ${season}`}
      right={<span className="text-[10px] text-ink-3">{rows.length} PLAYERS</span>}
    >
      <DataTable<PlayerStatRow>
        columns={cols}
        rows={rows}
        rowKey={(r, i) => `${r.id}-${r.position}-${i}`}
        defaultSort={{ key: columns[0]?.key ?? "player", dir: "desc" }}
        pageSize={30}
        maxHeight="32rem"
        emptyLabel="NO LINES FOR THIS SEASON"
      />
    </Panel>
  );
}
