"use client";

import DataTable, { type Column } from "@/components/ui/DataTable";
import PlayerLink from "@/components/mlb/PlayerLink";
import Panel from "@/components/ui/Panel";
import Glossary from "@/components/mlb/Glossary";
import {
  leaderBoard,
  teamStatNum,
  teamStatText,
  PLAYER_LEADER_SPECS,
  type PlayerStatRow,
  type TradedPlayer,
  type StatGroup,
  type TeamStatCol,
} from "@/lib/mlb";

/*
 * One club's players in one group: who leads the club in the five figures the
 * group is read by, then every line under it. Client-side because the table
 * sorts — the columns carry render functions, which a server component can't
 * hand across, so the spec crosses as plain data and the columns are built
 * here. The leaders are ranked from those same rows rather than fetched, so
 * the whole block costs one request.
 */

/* The column each table opens sorted by: the playing-time figure the rest of
   the line is read against, not the first column. */
const DEFAULT_SORT: Record<StatGroup, string> = {
  hitting: "atBats",
  pitching: "inningsPitched",
  fielding: "innings",
};

const TITLES: Record<StatGroup, string> = {
  hitting: "BATTING",
  pitching: "PITCHING",
  fielding: "FIELDING",
};

/** Games the club has played, as its busiest player has seen them. */
const teamGamesOf = (group: StatGroup, rows: PlayerStatRow[]) =>
  Math.max(
    0,
    ...rows.map(
      (r) =>
        teamStatNum(r.values[group === "fielding" ? "games" : "gamesPlayed"]) ??
        0
    )
  );

function LeaderTiles({
  group,
  rows,
}: {
  group: StatGroup;
  rows: PlayerStatRow[];
}) {
  const teamGames = teamGamesOf(group, rows);
  const boards = PLAYER_LEADER_SPECS[group]
    .map((spec) => leaderBoard(spec, rows, teamGames))
    .filter((b) => b.leaders.length > 0);
  if (boards.length === 0) return null;

  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {boards.map((b) => {
        const top = b.leaders[0];
        return (
          <div key={b.key} className="border border-line bg-bg p-2">
            <p className="text-[10px] tracking-[0.2em] text-ink-3">{b.label}</p>
            <div className="mt-1.5 min-w-0 text-[11px] text-ink-2">
              <PlayerLink id={top.id}>{top.name}</PlayerLink>
            </div>
            <p className="mt-1 text-xl font-bold leading-none tabular-nums text-ink">
              {top.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function PlayerStatTables({
  group,
  columns,
  rows,
  season,
  traded: tradedList,
}: {
  group: StatGroup;
  columns: TeamStatCol[];
  rows: PlayerStatRow[];
  season: number;
  /** Everyone a trade moved this season — marked in the table, listed under it. */
  traded: TradedPlayer[];
}) {
  /* Only the ones who actually appear in this table are worth a mark or a
     line: a club trades for prospects who never take an at-bat. */
  const onTeam = new Set(rows.map((r) => r.id));
  const moved = tradedList.filter((t) => onTeam.has(t.id));
  const traded = new Set(moved.map((t) => t.id));
  const cols: Column<PlayerStatRow>[] = [
    {
      key: "player",
      label: "PLAYER",
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <PlayerLink id={r.id}>{r.name}</PlayerLink>
          {traded.has(r.id) && (
            <span title="Traded mid-season — see the note below the table">*</span>
          )}
          {/* The position rides with the name the way a box score prints it;
              a fielder who moved around carries a star (see mergeFielding). */}
          {r.position && (
            <span className="shrink-0 text-[10px] tracking-wider text-ink-3">
              {r.position}
            </span>
          )}
        </span>
      ),
    },
    ...columns.map(
      (c): Column<PlayerStatRow> => ({
        key: c.key,
        label: c.label,
        align: "center",
        sortValue: (r) => teamStatNum(r.values[c.key]),
        render: (r) => <span title={c.title}>{teamStatText(r.values[c.key])}</span>,
      })
    ),
  ];

  return (
    <Panel title={`${TITLES[group]} STATS — ${season}`}>
      <LeaderTiles group={group} rows={rows} />
      <DataTable<PlayerStatRow>
        columns={cols}
        rows={rows}
        rowKey={(r, i) => `${r.id}-${i}`}
        defaultSort={{ key: DEFAULT_SORT[group], dir: "desc" }}
        pageSize={Infinity}
        /* The page scrolls, not the table: a roster is read straight down,
           and a box inside a box gives it two scrollbars. */
        maxHeight="none"
        showCount={false}
        emptyLabel="NO LINES FOR THIS SEASON"
      />
      {moved.length > 0 && (
        <ul className="mt-3 space-y-1 border border-line bg-bg px-3 py-2.5 text-[10px] text-ink-3">
          {moved.map((t) => (
            <li key={t.id} className="flex gap-2">
              <span className="shrink-0 text-ink">*</span>
              <span>
                <span className="text-ink-2">{t.name}</span> — {t.note}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Glossary
          entries={columns.map((c) => ({ label: c.label, title: c.title }))}
          groups={
            moved.length > 0
              ? [
                  {
                    name: "MARKS",
                    entries: [
                      { label: "*", title: "Traded mid-season — this line is only what the player did here" },
                    ],
                  },
                ]
              : []
          }
        />
      </div>
    </Panel>
  );
}
