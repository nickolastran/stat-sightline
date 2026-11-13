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
import type { FreeAgent } from "@/lib/freeAgents";

/*
 * The free-agent class, filtered in the browser like the injury board.
 * Opens on available MLB free agents — the minor-league ones are most of the
 * list and few people are looking for them.
 *
 * Status and type are the two questions everyone asks first, so they are
 * buttons with their counts on them rather than selects; the counts follow
 * every other filter, so they answer "how many Yankees are still out there".
 */

const BLANK = {
  status: "AVAILABLE",
  type: "MLB",
  team: "",
  position: "",
  name: "",
};
type Filters = typeof BLANK;

/** The MLB class at a glance — the minor-league free agents left out. */
function Summary({ agents, season }: { agents: FreeAgent[]; season: number }) {
  const mlbClass = agents.filter((a) => a.type === "MLB");
  const open = mlbClass.filter((a) => a.toId === null);
  /* Best by what he did last year, not by what he was paid for it. */
  const top = open.reduce<FreeAgent | null>(
    (best, a) =>
      a.war !== null && a.war > (best?.war ?? -Infinity) ? a : best,
    null,
  );
  const qo = mlbClass.filter((a) => /qualifying offer/i.test(a.note)).length;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <MetricCard label="AVAILABLE" value={String(open.length)} sub="MLB FREE AGENTS" />
      <MetricCard
        label="SIGNED"
        value={String(mlbClass.length - open.length)}
        sub={`OF ${mlbClass.length} MLB FREE AGENTS`}
      />
      <MetricCard
        label="TOP AVAILABLE"
        value={top ? `${top.war!.toFixed(1)} WAR` : "—"}
        sub={top ? `${top.name.toUpperCase()} · ${season}` : "NO STATS YET"}
      />
      <MetricCard label="QUALIFYING OFFERS" value={String(qo)} sub="EXTENDED" />
    </div>
  );
}

export default function FreeAgentBoard({
  agents,
  season,
}: {
  agents: FreeAgent[];
  season: number;
}) {
  const [f, setF] = useUrlFilters(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF({ ...f, [key]: value });
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

  const status = (a: FreeAgent) => (a.toId === null ? "AVAILABLE" : "SIGNED");
  /* Everything but status and type, so each button can count its own. */
  const base = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    return agents.filter(
      (a) =>
        (!f.team || a.fromAbbr === f.team) &&
        (!f.position || a.position === f.position) &&
        (!name || a.name.toLowerCase().includes(name)),
    );
  }, [agents, f.team, f.position, f.name]);
  const count = (keep: (a: FreeAgent) => boolean) =>
    base.filter(keep).length;
  const rows = base.filter(
    (a) => (!f.status || status(a) === f.status) && (!f.type || a.type === f.type),
  );

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
      key: "war",
      label: `${season} WAR`,
      align: "right",
      width: "6rem",
      sortValue: (a) => a.war,
      render: (a) => (a.war === null ? "—" : a.war.toFixed(1)),
    },
    {
      /* OPS for a hitter and ERA for a pitcher don't sort against each other,
         so the line is read here and ranked by WAR beside it. */
      key: "line",
      label: `${season} LINE`,
      width: "10rem",
      render: (a) => <span className="text-ink-2">{a.line || "—"}</span>,
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
            label: `${season} SALARY`,
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
          <span className="text-ink-3">AVAILABLE</span>
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
      render: (a) => (a.declared ? a.declared.slice(5).replace("-", "/") : "—"),
    },
  ];

  return (
    <div className="space-y-3">
      <Summary agents={agents} season={season} />
      <div className="flex flex-wrap items-center gap-1.5">
        <SegmentedControl
          ariaLabel="Status"
          value={f.status}
          onChange={(v) => set("status", v)}
          options={["AVAILABLE", "SIGNED", ""].map((v) => ({
            value: v,
            label: `${v || "ALL"} ${count(
              (a) => (!v || status(a) === v) && (!f.type || a.type === f.type),
            )}`,
          }))}
        />
        <SegmentedControl
          ariaLabel="Type"
          value={f.type}
          onChange={(v) => set("type", v)}
          options={["MLB", "MiLB", ""].map((v) => ({
            value: v,
            label: `${v || "ALL"} ${count(
              (a) => (!v || a.type === v) && (!f.status || status(a) === f.status),
            )}`,
          }))}
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
        defaultSort={{ key: "war", dir: "desc" }}
        pageSize={50}
        paginate
        maxHeight="none"
        emptyLabel="NO FREE AGENTS MATCH THESE FILTERS"
      />
    </div>
  );
}
