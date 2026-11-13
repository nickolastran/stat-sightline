"use client";

import { useMemo } from "react";
import { useUrlFilters } from "@/lib/useUrlFilters";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterSelect, { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import MetricCard from "@/components/ui/MetricCard";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { money } from "@/lib/draft";
import type { Salary } from "@/lib/salaries";

/*
 * One season's salaries, ranked. The season is a URL parameter — it is
 * another season's rows, fetched on the server — and the club and the
 * position are filters here, over rows already held.
 *
 * The rank is the one the season was ranked in, not the row's place in the
 * filtered list: a club's best-paid player is the league's 14th best-paid,
 * and that is the number worth printing.
 *
 * PAYROLLS is the same rows summed by club. The file lists only salaries
 * Baseball-Reference prints — no pre-arbitration minimums — so a payroll here
 * is the listed money, short of a club's full number.
 */

/* The view rides in the URL with the filters, but RESET leaves it alone. */
const BLANK = { view: "players", team: "", position: "", name: "" };
type Filters = typeof BLANK;

interface Payroll {
  rank: number;
  team: string;
  teamId: number | null;
  total: number;
  players: number;
  top: Salary;
}

/** Rows summed by club, biggest first. */
function payrolls(rows: Salary[]): Payroll[] {
  const by = new Map<string, Salary[]>();
  for (const s of rows) by.set(s.team, [...(by.get(s.team) ?? []), s]);
  return [...by.values()]
    .map((list) => ({
      team: list[0].team,
      teamId: list[0].teamId,
      total: list.reduce((sum, s) => sum + (s.salary ?? 0), 0),
      players: list.length,
      /* Rows arrive ranked, so the first is the club's best-paid. */
      top: list[0],
    }))
    .sort((a, b) => b.total - a.total)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function SalaryBoard({ salaries }: { salaries: Salary[] }) {
  const [f, setF] = useUrlFilters(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF({ ...f, [key]: value });
  const dirty = Boolean(f.team || f.position || f.name);

  const options = useMemo(() => {
    const seen = (pick: (s: Salary) => string) =>
      [...new Set(salaries.map(pick).filter(Boolean))].sort();
    return { teams: seen((s) => s.team), positions: seen((s) => s.position) };
  }, [salaries]);

  const rows = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    return salaries.filter(
      (s) =>
        (!f.team || s.team === f.team) &&
        (!f.position || s.position === f.position) &&
        (!name || s.name.toLowerCase().includes(name)),
    );
  }, [salaries, f]);
  /* Every club, whatever TEAM says — a payroll board of one club isn't one. */
  const clubs = useMemo(
    () =>
      payrolls(
        salaries.filter((s) => !f.position || s.position === f.position),
      ),
    [salaries, f.position],
  );

  const paid = rows.flatMap((s) => (s.salary === null ? [] : [s.salary]));
  const total = paid.reduce((sum, v) => sum + v, 0);
  const most = clubs[0]?.total ?? 0;

  const clubCols: Column<Payroll>[] = [
    {
      key: "rank",
      label: "RANK",
      align: "right",
      width: "5rem",
      sortValue: (p) => p.rank,
      render: (p) => <span className="text-ink-3">{p.rank}</span>,
    },
    {
      key: "team",
      label: "TEAM",
      width: "9rem",
      sortValue: (p) => p.team,
      render: (p) => <TeamLink id={p.teamId} name={p.team} text={p.team} />,
    },
    {
      key: "total",
      label: "PAYROLL",
      width: "18rem",
      sortValue: (p) => p.total,
      /* The bar is against the biggest payroll on the board, so the gap
         between the top and the bottom reads at a glance. */
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-right tabular-nums">{money(p.total)}</span>
          <span className="h-1.5 flex-1 bg-surface-2">
            <span
              className="block h-full bg-accent"
              style={{ width: `${most ? (p.total / most) * 100 : 0}%` }}
            />
          </span>
        </div>
      ),
    },
    {
      key: "players",
      label: "PLAYERS",
      align: "right",
      width: "6rem",
      sortValue: (p) => p.players,
      /* Down to the club's own rows, on the players view. */
      render: (p) => (
        <button
          type="button"
          onClick={() => {
            setF({ ...BLANK, position: f.position, team: p.team });
          }}
          className="text-ink-2 hover:text-accent hover:underline"
        >
          {p.players}
        </button>
      ),
    },
    {
      key: "avg",
      label: "AVERAGE",
      align: "right",
      width: "7rem",
      sortValue: (p) => p.total / p.players,
      render: (p) => money(Math.round(p.total / p.players)),
    },
    {
      key: "top",
      label: "HIGHEST PAID",
      width: "16rem",
      sortValue: (p) => p.top.salary,
      render: (p) => (
        <span className="flex items-center gap-2">
          <PlayerLink id={p.top.id}>{p.top.name}</PlayerLink>
          <span className="text-ink-3 tabular-nums">{money(p.top.salary)}</span>
        </span>
      ),
    },
  ];

  const cols: Column<Salary>[] = [
    {
      key: "rank",
      label: "RANK",
      align: "right",
      width: "5rem",
      sortValue: (s) => (s.rank === 0 ? null : s.rank),
      render: (s) => <span className="text-ink-3">{s.rank || "—"}</span>,
    },
    {
      key: "name",
      label: "NAME",
      width: "13rem",
      sortValue: (s) => s.name,
      render: (s) => (
        <PlayerLink id={s.id}>{s.name}</PlayerLink>
      ),
    },
    {
      key: "position",
      label: "POSITION",
      align: "center",
      width: "6rem",
      sortValue: (s) => s.position,
      render: (s) => s.position || "—",
    },
    {
      key: "team",
      label: "TEAM",
      width: "9rem",
      sortValue: (s) => s.team,
      /* Whatever the file calls the club, over the mark of the franchise it
         is now — an unmatched club still prints, it just isn't a link. */
      render: (s) => <TeamLink id={s.teamId} name={s.team} text={s.team} />,
    },
    {
      key: "salary",
      label: "SALARY",
      align: "right",
      width: "8rem",
      sortValue: (s) => s.salary,
      render: (s) => money(s.salary),
    },
  ];

  const players = f.view !== "payrolls";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="TOTAL" value={money(total)} sub={f.team || "ALL CLUBS"} />
        <MetricCard label="PLAYERS" value={String(rows.length)} sub="WITH A LISTED SALARY" />
        <MetricCard
          label="AVERAGE"
          value={money(paid.length ? Math.round(total / paid.length) : null)}
        />
        <MetricCard label="MEDIAN" value={money(median(paid))} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SegmentedControl
          ariaLabel="View"
          value={players ? "players" : "payrolls"}
          onChange={(v) => set("view", v)}
          options={[
            { value: "players", label: "PLAYERS" },
            { value: "payrolls", label: "PAYROLLS" },
          ]}
        />
        {players && (
          <FilterSelect label="TEAM" value={f.team} options={options.teams} onChange={(v) => set("team", v)} />
        )}
        <FilterSelect label="POSITION" value={f.position} options={options.positions} onChange={(v) => set("position", v)} />
        {players && (
          <input
            type="search"
            aria-label="Name"
            placeholder="NAME"
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            className={`${FILTER_CONTROL} w-36 ${f.name ? "border-accent" : ""}`}
          />
        )}
        <button
          type="button"
          onClick={() => setF({ ...BLANK, view: f.view })}
          disabled={!dirty}
          className={`${FILTER_CONTROL} ml-auto tracking-[0.2em] ${
            dirty ? "text-ink-2 hover:text-ink" : "cursor-default text-ink-3 opacity-50"
          }`}
        >
          RESET
        </button>
      </div>
      {players ? (
        <DataTable<Salary>
          columns={cols}
          rows={rows}
          rowKey={(s, i) => `${s.id ?? s.name}-${i}`}
          pageSize={50}
          paginate
          /* The page scrolls, not the table. */
          maxHeight="none"
          emptyLabel="NO SALARIES MATCH THESE FILTERS"
        />
      ) : (
        <DataTable<Payroll>
          columns={clubCols}
          rows={clubs}
          rowKey={(p) => p.team}
          maxHeight="none"
          emptyLabel="NO PAYROLLS MATCH THESE FILTERS"
        />
      )}
    </div>
  );
}
