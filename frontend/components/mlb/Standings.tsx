"use client";

import { useMemo, useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SortHeader from "@/components/ui/SortHeader";
import TeamLink from "@/components/mlb/TeamLink";
import { sortRows, toggleSort, type Sort } from "@/lib/sortTable";
import type { Division, StandingRow } from "@/lib/mlb";

/*
 * Standings at three scopes — by division, by league, and all of MLB — off a
 * single payload: the server hands over the six division tables and this
 * component regroups them, so switching scope costs no request.
 *
 * Every stat column is clickable and sorts most → least on first click. Sort
 * state lives here rather than in each table, so ordering by HOME RUNS at
 * division scope orders all six tables the same way and the columns stay
 * comparable across groups.
 */

type Scope = "division" | "league" | "mlb";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "division", label: "DIVISION" },
  { value: "league", label: "LEAGUE" },
  { value: "mlb", label: "ALL MLB" },
];

/** A games-back figure: the leader's "-" is 0 games back, not a missing value. */
const gbNum = (gb: string) => (gb === "-" || gb === "" ? 0 : Number(gb));

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

interface Col {
  key: string;
  label: string;
  title: string;
  text: (r: StandingRow, scope: Scope) => string;
  num: (r: StandingRow, scope: Scope) => number | null;
}

/*
 * Games back is scope-relative: at league scope a club's GB is its distance
 * from the best record in its league, not its division. The API reports all
 * three figures, so the column reads the one matching the active scope
 * instead of the merged view showing a number that means something else.
 */
const pick = <T,>(scope: Scope, div: T, league: T, mlb: T) =>
  scope === "division" ? div : scope === "league" ? league : mlb;

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
    text: (r, s) => pick(s, r.gb, r.leagueGb, r.sportGb),
    num: (r, s) => gbNum(pick(s, r.gb, r.leagueGb, r.sportGb)),
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

const DEFAULT_SORT: Sort = { key: "pct", dir: "desc" };

interface Group {
  id: string;
  name: string;
  teams: StandingRow[];
}

/** The six division tables regrouped for the active scope. */
function groupsFor(divisions: Division[], scope: Scope): Group[] {
  if (scope === "division")
    return divisions.map((d) => ({
      id: String(d.id),
      name: d.name,
      teams: d.teams,
    }));

  const all = divisions.flatMap((d) => d.teams);
  if (scope === "mlb") return [{ id: "mlb", name: "MAJOR LEAGUE BASEBALL", teams: all }];

  const leagues = [...new Set(divisions.map((d) => d.leagueId))].sort();
  return leagues.map((leagueId) => ({
    id: String(leagueId),
    name: divisions.find((d) => d.leagueId === leagueId)!.league,
    teams: all.filter((t) => t.leagueId === leagueId),
  }));
}

function StandingsTable({
  group,
  scope,
  sort,
  onSort,
}: {
  group: Group;
  scope: Scope;
  sort: Sort;
  onSort: (key: string) => void;
}) {
  const col = COLS.find((c) => c.key === sort.key)!;
  const teams = useMemo(
    () => sortRows(group.teams, sort.dir, (r) => col.num(r, scope)),
    [group.teams, sort.dir, col, scope]
  );

  return (
    <div className="border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {group.name}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-xs">
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
              {COLS.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  title={c.title}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
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
                  <TeamLink id={t.id} name={t.name} />
                </td>
                {scope !== "division" && (
                  <td className="px-2 py-1.5 text-[10px] tracking-wider text-ink-3">
                    {t.division}
                  </td>
                )}
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      c.key === "w" ? "font-bold text-ink" : ""
                    } ${sort.key === c.key ? "text-ink" : ""}`}
                  >
                    {c.text(t, scope)}
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

export default function Standings({ divisions }: { divisions: Division[] }) {
  const [scope, setScope] = useState<Scope>("division");
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  if (divisions.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO STANDINGS FOR THIS SEASON YET
      </p>
    );

  const groups = groupsFor(divisions, scope);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
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
          sort={sort}
          onSort={(key) => setSort((s) => toggleSort(s, key))}
        />
      ))}
    </div>
  );
}
