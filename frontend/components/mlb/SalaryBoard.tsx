"use client";

import { useMemo, useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterSelect, { FILTER_CONTROL } from "@/components/ui/FilterSelect";
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
 */

const BLANK = { team: "", position: "", name: "" };
type Filters = typeof BLANK;

export default function SalaryBoard({ salaries }: { salaries: Salary[] }) {
  const [f, setF] = useState<Filters>(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const dirty = Object.values(f).some(Boolean);

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

  const total = rows.reduce((sum, s) => sum + (s.salary ?? 0), 0);

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
        <PlayerLink id={s.id} headshot={false}>
          {s.name}
        </PlayerLink>
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect label="TEAM" value={f.team} options={options.teams} onChange={(v) => set("team", v)} />
        <FilterSelect label="POSITION" value={f.position} options={options.positions} onChange={(v) => set("position", v)} />
        <input
          type="search"
          aria-label="Name"
          placeholder="NAME"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          className={`${FILTER_CONTROL} w-36 ${f.name ? "border-accent" : ""}`}
        />
        <span className="text-[10px] tracking-[0.2em] text-ink-3">
          {rows.length} PLAYERS — {money(total)}
        </span>
        <button
          type="button"
          onClick={() => setF(BLANK)}
          disabled={!dirty}
          className={`${FILTER_CONTROL} ml-auto tracking-[0.2em] ${
            dirty ? "text-ink-2 hover:text-ink" : "cursor-default text-ink-3 opacity-50"
          }`}
        >
          RESET
        </button>
      </div>
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
    </div>
  );
}
