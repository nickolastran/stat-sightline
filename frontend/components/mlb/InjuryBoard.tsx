"use client";

import { useMemo, useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterSelect, { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import type { Injury } from "@/lib/injuries";

/*
 * Every club's injured players, filtered in the browser — the same trade the
 * draft board makes: the whole league's report is one server render, and
 * narrowing it to one club or one list is a reshuffle of rows already held.
 */

const BLANK = { team: "", status: "", position: "", name: "" };
type Filters = typeof BLANK;

/** A placement date as MM/DD, sliced rather than parsed (see lib/draft.ts). */
const since = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "—";

export default function InjuryBoard({ injuries }: { injuries: Injury[] }) {
  const [f, setF] = useState<Filters>(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const dirty = Object.values(f).some(Boolean);

  const options = useMemo(() => {
    const seen = (pick: (i: Injury) => string, sort = true) => {
      const values = [...new Set(injuries.map(pick).filter(Boolean))];
      return sort ? values.sort() : values;
    };
    return {
      /* Clubs keep the order the server sent them in — by division. */
      teams: seen((i) => i.abbr, false),
      statuses: seen((i) => i.status),
      positions: seen((i) => i.position),
    };
  }, [injuries]);

  const rows = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    return injuries.filter(
      (i) =>
        (!f.team || i.abbr === f.team) &&
        (!f.status || i.status === f.status) &&
        (!f.position || i.position === f.position) &&
        (!name || i.name.toLowerCase().includes(name)),
    );
  }, [injuries, f]);

  /* Widths sized to fit the page rather than to the longest note — the note
     is the one column with no natural width, so it takes what is left. */
  const cols: Column<Injury>[] = [
    {
      key: "team",
      label: "TEAM",
      width: "6rem",
      sortValue: (i) => i.abbr,
      render: (i) => <TeamLink id={i.teamId} name={i.team} text={i.abbr} />,
    },
    {
      key: "name",
      label: "PLAYER",
      width: "11rem",
      sortValue: (i) => i.name,
      render: (i) => (
        <PlayerLink id={i.id} headshot={false}>
          {i.name}
        </PlayerLink>
      ),
    },
    {
      key: "position",
      label: "POS",
      align: "center",
      width: "4rem",
      sortValue: (i) => i.position,
      render: (i) => i.position || "—",
    },
    {
      key: "status",
      label: "LIST",
      width: "9rem",
      sortValue: (i) => i.status,
      render: (i) => <span className="text-ink-3">{i.status}</span>,
    },
    {
      key: "since",
      label: "PLACED",
      align: "right",
      width: "5rem",
      sortValue: (i) => i.since,
      render: (i) => <span title={i.since || undefined}>{since(i.since)}</span>,
    },
    {
      key: "note",
      label: "INJURY",
      width: "22rem",
      sortValue: (i) => i.note,
      /* Clipped at the width it is given, so the whole line is the hover. */
      render: (i) =>
        i.note ? (
          <span title={i.note}>{i.note}</span>
        ) : (
          <span className="text-ink-3">NOT DISCLOSED</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect label="TEAM" value={f.team} options={options.teams} onChange={(v) => set("team", v)} />
        <FilterSelect label="LIST" value={f.status} options={options.statuses} onChange={(v) => set("status", v)} />
        <FilterSelect label="POSITION" value={f.position} options={options.positions} onChange={(v) => set("position", v)} />
        <input
          type="search"
          aria-label="Player"
          placeholder="PLAYER"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          className={`${FILTER_CONTROL} w-36 ${f.name ? "border-accent" : ""}`}
        />
        <span className="text-[10px] tracking-[0.2em] text-ink-3">
          {rows.length} ON THE IL
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
      <DataTable<Injury>
        columns={cols}
        rows={rows}
        rowKey={(i) => `${i.teamId}-${i.id}`}
        pageSize={50}
        paginate
        /* The page scrolls, not the table. */
        maxHeight="none"
        emptyLabel="NOBODY ON THE IL MATCHES THESE FILTERS"
      />
    </div>
  );
}
