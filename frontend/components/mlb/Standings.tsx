"use client";

import { useMemo, useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SortHeader from "@/components/ui/SortHeader";
import TeamLink from "@/components/mlb/TeamLink";
import { sortRows, toggleSort, type Sort } from "@/lib/sortTable";
import Glossary from "@/components/mlb/Glossary";
import {
  clinchMark,
  clinchPhase,
  gamesBack,
  CLINCH_LEGEND,
  type ClinchPhase,
  type Division,
  type StandingRow,
} from "@/lib/mlb";
import type { StandingsProjection, TeamProjection } from "@/lib/api";

/*
 * Standings at three scopes — by division, by league, and all of MLB — off a
 * single payload: the server hands over the six division tables and this
 * component regroups them, so switching scope costs no request.
 *
 * Every stat column is clickable and sorts most → least on first click. Sort
 * state lives here rather than in each table, so ordering by HOME RUNS at
 * division scope orders all six tables the same way and the columns stay
 * comparable across groups.
 *
 * When the projection service answers, three more columns join on team id —
 * projected final wins, and the two paces. They are dropped entirely rather
 * than shown empty if it doesn't, so the standings never depend on it.
 */

type Scope = "division" | "league" | "mlb";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "division", label: "DIVISION" },
  { value: "league", label: "LEAGUE" },
  { value: "mlb", label: "ALL MLB" },
];

/** "5-5" → 5 wins, so the split columns sort by wins over the span. */
const recordWins = (r: string) => {
  const w = Number(r.split("-")[0]);
  return Number.isFinite(w) ? w : null;
};

/** "W4" → 4, "L2" → -2, so a sort runs hottest streak to coldest. */
const streakNum = (s: string) => {
  const n = Number(s.slice(1));
  if (!Number.isFinite(n)) return null;
  return s.startsWith("L") ? -n : n;
};

/** A standings line with its projection attached, and its games back of the
 * leader of whichever group it is being shown in. */
type Row = StandingRow & { proj: TeamProjection | null; gbGames: number };

interface Col {
  key: string;
  label: string;
  title: string;
  text: (r: Row) => string;
  num: (r: Row) => number | null;
}

const COLS: Col[] = [
  {
    key: "w",
    label: "W",
    title: "Wins",
    text: (r) => String(r.wins),
    num: (r) => r.wins,
  },
  {
    key: "l",
    label: "L",
    title: "Losses",
    text: (r) => String(r.losses),
    num: (r) => r.losses,
  },
  {
    key: "pct",
    label: "PCT",
    title: "Winning percentage",
    text: (r) => r.pct,
    num: (r) => Number(r.pct) || 0,
  },
  {
    key: "gb",
    label: "GB",
    title: "Games back of the leader in the current scope",
    text: (r) => (r.gbGames === 0 ? "-" : r.gbGames.toFixed(1)),
    num: (r) => r.gbGames,
  },
  {
    key: "rs",
    label: "RS",
    title: "Runs scored",
    text: (r) => String(r.runsScored),
    num: (r) => r.runsScored,
  },
  {
    key: "ra",
    label: "RA",
    title: "Runs allowed",
    text: (r) => String(r.runsAllowed),
    num: (r) => r.runsAllowed,
  },
  {
    key: "diff",
    label: "DIFF",
    title: "Run differential",
    text: (r) => (r.runDiff > 0 ? `+${r.runDiff}` : String(r.runDiff)),
    num: (r) => r.runDiff,
  },
  {
    key: "l10",
    label: "L10",
    title: "Record over the last ten games",
    text: (r) => r.last10,
    num: (r) => recordWins(r.last10),
  },
  {
    key: "home",
    label: "HOME",
    title: "Home record",
    text: (r) => r.home,
    num: (r) => recordWins(r.home),
  },
  {
    key: "away",
    label: "AWAY",
    title: "Road record",
    text: (r) => r.away,
    num: (r) => recordWins(r.away),
  },
  {
    key: "strk",
    label: "STRK",
    title: "Current streak",
    text: (r) => r.streak,
    num: (r) => streakNum(r.streak),
  },
];

/*
 * The projection columns. A club with no projection reads "—" and sorts to the
 * bottom in both directions, the same as any other missing stat.
 */
const PROJ_COLS: Col[] = [
  {
    key: "proj",
    label: "PROJ",
    title:
      "Projected final wins — actual wins plus the win probability of every remaining game",
    text: (r) => (r.proj ? r.proj.projected_wins.toFixed(1) : "—"),
    num: (r) => r.proj?.projected_wins ?? null,
  },
  {
    key: "pace",
    label: "PACE",
    title:
      "Wins the projection expects by this point in the schedule — more actual wins than this means the club is outrunning the model",
    text: (r) => (r.proj ? r.proj.pace_wins.toFixed(1) : "—"),
    num: (r) => r.proj?.pace_wins ?? null,
  },
  {
    key: "p162",
    label: "P162",
    title: "Current win rate stretched over a full 162-game season",
    text: (r) => (r.proj ? r.proj.pace_162.toFixed(1) : "—"),
    num: (r) => r.proj?.pace_162 ?? null,
  },
];

const DEFAULT_SORT: Sort = { key: "pct", dir: "desc" };

/*
 * Column widths in rem, shared by every table on the page. TEAM fits the
 * longest club name before TeamLink truncates it, DIV fits "AL CENTRAL", and
 * one width covers every stat — the widest cell any of them holds is a record
 * like "34–21". Below the total the table scrolls rather than squeezing.
 */
const TEAM_W = 12;
const DIV_W = 5.5;
const STAT_W = 3.5;

const gridWidth = (scope: Scope, cols: Col[]) =>
  TEAM_W + (scope === "division" ? 0 : DIV_W) + cols.length * STAT_W;

interface Group {
  id: string;
  name: string;
  teams: Row[];
}

/**
 * The six division tables regrouped for the active scope. Games back is
 * measured within each finished group, so the same club reads 3.0 back of its
 * division and 9.0 back of its league without either number being invented.
 */
function groupsFor(divisions: Division[], scope: Scope, proj: Map<number, TeamProjection>): Group[] {
  const rows = (teams: StandingRow[]): Row[] => {
    const gb = gamesBack(teams);
    return teams.map((t) => ({
      ...t,
      proj: proj.get(t.id) ?? null,
      gbGames: gb(t),
    }));
  };

  if (scope === "division")
    return divisions.map((d) => ({
      id: String(d.id),
      name: d.name,
      teams: rows(d.teams),
    }));

  const all = divisions.flatMap((d) => d.teams);
  if (scope === "mlb")
    return [{ id: "mlb", name: "MAJOR LEAGUE BASEBALL", teams: rows(all) }];

  const leagues = [...new Set(divisions.map((d) => d.leagueId))].sort();
  return leagues.map((leagueId) => ({
    id: String(leagueId),
    name: divisions.find((d) => d.leagueId === leagueId)!.league,
    teams: rows(all.filter((t) => t.leagueId === leagueId)),
  }));
}

/**
 * The clinch/elimination symbol, ahead of the club it belongs to and spelled
 * out on hover. Quiet by design — it qualifies the row rather than competing
 * with the record, so it sits in the muted ink the other annotations use.
 */
export function ClinchMark({
  row,
  phase,
}: {
  row: StandingRow;
  phase: ClinchPhase;
}) {
  const mark = clinchMark(row, phase);
  if (!mark) return null;
  return (
    <span
      className="shrink-0 tabular-nums text-ink-3"
      title={CLINCH_LEGEND.find((c) => c.label === mark)?.title}
    >
      {mark} –
    </span>
  );
}

function StandingsTable({
  group,
  scope,
  cols,
  sort,
  onSort,
  phase,
}: {
  group: Group;
  scope: Scope;
  cols: Col[];
  sort: Sort;
  onSort: (key: string) => void;
  phase: ClinchPhase;
}) {
  // A sort can outlive its column — order by PROJ, then have the projection go
  // away on the next render — so fall back to the default rather than crash.
  const col =
    cols.find((c) => c.key === sort.key) ??
    cols.find((c) => c.key === DEFAULT_SORT.key)!;
  const teams = useMemo(
    () => sortRows(group.teams, sort.dir, (r) => col.num(r)),
    [group.teams, sort.dir, col]
  );

  return (
    <div className="border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {group.name}
      </h3>
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed text-xs"
          style={{ minWidth: `${gridWidth(scope, cols)}rem` }}
        >
          {/* Every scope renders one table per group, and auto layout would
              size each to its own longest team name — so the AL East stats
              would sit a few pixels off the AL West ones. Fixed widths put
              all of them on one grid. */}
          <colgroup>
            <col style={{ width: `${TEAM_W}rem` }} />
            {scope !== "division" && <col style={{ width: `${DIV_W}rem` }} />}
            {cols.map((c) => (
              <col key={c.key} style={{ width: `${STAT_W}rem` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line bg-surface px-3 py-1.5 text-left text-[10px] tracking-widest font-normal text-ink-3"
              >
                TEAM
              </th>
              {scope !== "division" && (
                <th
                  scope="col"
                  className="border-b border-line bg-surface px-2 py-1.5 text-left text-[10px] tracking-widest font-normal text-ink-3"
                >
                  DIV
                </th>
              )}
              {cols.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  title={c.title}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                  align="center"
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.id}
                className="border-t border-grid text-ink-2 hover:bg-surface-2"
              >
                <td className="px-3 py-1.5">
                  {/* TeamLink is a flex row of its own, so the mark only sits
                      beside the logo from inside a row with it. */}
                  <span className="flex items-center gap-1">
                    <ClinchMark row={t} phase={phase} />
                    <TeamLink id={t.id} name={t.name} className="min-w-0" />
                  </span>
                </td>
                {scope !== "division" && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-[10px] tracking-wider text-ink-3">
                    {t.division}
                  </td>
                )}
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-2 py-1.5 text-center tabular-nums ${
                      c.key === "w" ? "font-bold text-ink" : ""
                    } ${sort.key === c.key ? "text-ink" : ""}`}
                  >
                    {c.text(t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * How well the model behind the projection actually predicts, stated next to
 * the numbers it produces — including when it fails to beat always picking the
 * home team, which on team form alone it sometimes does.
 */
function ModelNote({ model, asOf }: { model: StandingsProjection["model"]; asOf: string | null }) {
  if (model.accuracy == null) return null;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <p className="text-[10px] leading-relaxed text-ink-3">
      PROJECTION · {pct(model.accuracy)} ACCURACY ON {model.holdout_season} HOLDOUT
      {model.home_baseline != null && ` (ALWAYS-HOME ${pct(model.home_baseline)})`}
      {model.log_loss != null && ` · LOG LOSS ${model.log_loss.toFixed(3)}`}
      {model.train_games != null && ` · FIT ON ${model.train_games.toLocaleString()} GAMES`}
      {asOf && ` · RESULTS THROUGH ${asOf}`}
    </p>
  );
}

export default function Standings({
  divisions,
  projection = null,
  left,
  seasonOver = false,
}: {
  divisions: Division[];
  /** Projected finishes, when the projection service answered. */
  projection?: StandingsProjection | null;
  /** Shares the controls row with the scope toggle — the view buttons. */
  left?: React.ReactNode;
  /** The season has been played out, so the clinch marks are the final word. */
  seasonOver?: boolean;
}) {
  const [scope, setScope] = useState<Scope>("division");
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  const byTeam = useMemo(
    () => new Map((projection?.teams ?? []).map((t) => [t.team_id, t])),
    [projection]
  );

  if (divisions.length === 0)
    return (
      <div className="space-y-3">
        {left}
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO STANDINGS FOR THIS SEASON YET
        </p>
      </div>
    );

  const cols = projection ? [...COLS, ...PROJ_COLS] : COLS;
  const groups = groupsFor(divisions, scope, byTeam);
  const phase = clinchPhase(
    divisions.flatMap((d) => d.teams),
    seasonOver
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {left}
        <SegmentedControl<Scope>
          ariaLabel="Standings scope"
          value={scope}
          onChange={setScope}
          options={SCOPES}
        />
      </div>

      {groups.map((g) => (
        <StandingsTable
          key={g.id}
          group={g}
          scope={scope}
          cols={cols}
          sort={sort}
          onSort={(key) => setSort((s) => toggleSort(s, key))}
          phase={phase}
        />
      ))}

      {projection && <ModelNote model={projection.model} asOf={projection.as_of} />}

      <Glossary
        entries={cols.map((c) => ({ label: c.label, title: c.title }))}
        /* No marks on the table means no key for them. */
        groups={
          phase === "none" ? [] : [{ name: "CLINCH", entries: CLINCH_LEGEND }]
        }
      />
    </div>
  );
}
