"use client";

import { useMemo, useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterSelect, { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { money } from "@/lib/draft";
import type { FreeAgent } from "@/lib/freeAgents";

/*
 * The free-agent class, filtered in the browser like the injury board.
 * Opens on available MLB free agents — the minor-league ones are most of the
 * list and few people are looking for them.
 */

const BLANK = {
  status: "AVAILABLE",
  type: "MLB",
  team: "",
  position: "",
  name: "",
};
type Filters = typeof BLANK;

export default function FreeAgentBoard({ agents }: { agents: FreeAgent[] }) {
  const [f, setF] = useState<Filters>(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const dirty = (Object.keys(BLANK) as (keyof Filters)[]).some(
    (k) => f[k] !== BLANK[k],
  );

  const options = useMemo(() => {
    const seen = (pick: (a: FreeAgent) => string) =>
      [...new Set(agents.map(pick).filter(Boolean))].sort();
    return {
      teams: seen((a) => a.fromAbbr),
      positions: seen((a) => a.position),
    };
  }, [agents]);

  const rows = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    return agents.filter(
      (a) =>
        (!f.status || (f.status === "AVAILABLE") === (a.toId === null)) &&
        (!f.type || a.type === f.type) &&
        (!f.team || a.fromAbbr === f.team) &&
        (!f.position || a.position === f.position) &&
        (!name || a.name.toLowerCase().includes(name)),
    );
  }, [agents, f]);

  /* No salary file yet is no salary column, rather than a column of dashes. */
  const paid = agents.some((a) => a.salary !== null);

  const cols: Column<FreeAgent>[] = [
    {
      key: "name",
      label: "PLAYER",
      width: "13rem",
      sortValue: (a) => a.name,
      render: (a) => <PlayerLink id={a.id}>{a.name}</PlayerLink>,
    },
    {
      key: "position",
      label: "POS",
      align: "center",
      width: "4rem",
      sortValue: (a) => a.position,
      render: (a) => a.position || "—",
    },
    {
      key: "age",
      label: "AGE",
      align: "right",
      width: "4rem",
      sortValue: (a) => a.age,
      render: (a) => a.age ?? "—",
    },
    {
      key: "hand",
      label: "B/T",
      align: "center",
      width: "4rem",
      sortValue: (a) => a.hand,
      render: (a) => a.hand || "—",
    },
    {
      key: "from",
      label: "PREV TEAM",
      width: "7rem",
      sortValue: (a) => a.fromAbbr,
      render: (a) =>
        a.fromId ? (
          <TeamLink id={a.fromId} name={a.fromName} text={a.fromAbbr} />
        ) : (
          "—"
        ),
    },
    ...(paid
      ? [
          {
            key: "salary",
            label: "PREV SALARY",
            align: "right",
            width: "8rem",
            sortValue: (a: FreeAgent) => a.salary,
            render: (a: FreeAgent) =>
              a.salary === null ? "—" : money(a.salary),
          } satisfies Column<FreeAgent>,
        ]
      : []),
    {
      key: "type",
      label: "TYPE",
      align: "center",
      width: "5rem",
      sortValue: (a) => a.type,
      render: (a) => a.type,
    },
    {
      key: "to",
      label: "SIGNED WITH",
      width: "7rem",
      sortValue: (a) => a.toAbbr,
      render: (a) =>
        a.toId ? (
          <TeamLink id={a.toId} name={a.toName} text={a.toAbbr} />
        ) : (
          <span className="text-accent">AVAILABLE</span>
        ),
    },
    {
      key: "note",
      label: "NOTE",
      width: "14rem",
      sortValue: (a) => a.note,
      render: (a) => (
        <span className="text-ink-3" title={a.note || undefined}>
          {a.note || "—"}
        </span>
      ),
    },
    {
      key: "declared",
      label: "DECLARED",
      align: "right",
      width: "6rem",
      sortValue: (a) => a.declared,
      render: (a) => a.declared.slice(5) || "—",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect
          label="STATUS"
          value={f.status}
          options={["AVAILABLE", "SIGNED"]}
          onChange={(v) => set("status", v)}
        />
        <FilterSelect
          label="TYPE"
          value={f.type}
          options={["MLB", "MiLB"]}
          onChange={(v) => set("type", v)}
        />
        <FilterSelect
          label="PREV TEAM"
          value={f.team}
          options={options.teams}
          onChange={(v) => set("team", v)}
        />
        <FilterSelect
          label="POSITION"
          value={f.position}
          options={options.positions}
          onChange={(v) => set("position", v)}
        />
        <input
          type="search"
          aria-label="Player"
          placeholder="PLAYER"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          className={`${FILTER_CONTROL} w-36 ${f.name ? "border-accent" : ""}`}
        />
        <span className="text-[10px] tracking-[0.2em] text-ink-3">
          {rows.length} PLAYERS
        </span>
        <button
          type="button"
          onClick={() => setF(BLANK)}
          disabled={!dirty}
          className={`${FILTER_CONTROL} ml-auto tracking-[0.2em] ${
            dirty
              ? "text-ink-2 hover:text-ink"
              : "cursor-default text-ink-3 opacity-50"
          }`}
        >
          RESET
        </button>
      </div>
      <DataTable<FreeAgent>
        columns={cols}
        rows={rows}
        rowKey={(a) => a.id}
        defaultSort={
          paid ? { key: "salary", dir: "desc" } : { key: "name", dir: "asc" }
        }
        pageSize={50}
        paginate
        maxHeight="none"
        emptyLabel="NO FREE AGENTS MATCH THESE FILTERS"
      />
    </div>
  );
}
