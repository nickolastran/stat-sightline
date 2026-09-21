"use client";

import { useMemo, useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FilterSelect, { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { dob, money, type DraftPick } from "@/lib/draft";

/*
 * One year's draft board, filtered in the browser.
 *
 * The whole draft is one payload on the server, so the filters are state here
 * rather than query parameters: narrowing 1,500 picks to one club's is a
 * reshuffle of rows already held, not a second ask to MLB. The year is the
 * one control that stays in the URL — that one *is* another draft.
 *
 * Sorting, the sticky header and the pager are DataTable's, which is why a
 * hundred-round draft mounts fifty picks at a time.
 */

/** Every filter, and what "nothing chosen" is — also what RESET restores. */
const BLANK = {
  round: "",
  position: "",
  team: "",
  state: "",
  country: "",
  name: "",
  school: "",
};

type Filters = typeof BLANK;

export default function DraftBoard({
  picks,
  filters: options,
}: {
  picks: DraftPick[];
  filters: {
    rounds: string[];
    positions: string[];
    teams: string[];
    states: string[];
    countries: string[];
  };
}) {
  const [f, setF] = useState<Filters>(BLANK);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const dirty = Object.values(f).some(Boolean);

  const rows = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    const school = f.school.trim().toLowerCase();
    return picks.filter(
      (p) =>
        (!f.round || p.round === f.round) &&
        (!f.position || p.position === f.position) &&
        (!f.team || p.team === f.team) &&
        (!f.state || p.state === f.state) &&
        (!f.country || p.country === f.country) &&
        (!name || p.name.toLowerCase().includes(name)) &&
        (!school || p.school.toLowerCase().includes(school)),
    );
  }, [picks, f]);

  /*
   * Fixed widths, sized to fit the board on screen rather than to the widest
   * cell in it. The board is read across drafts: a 1990 draft has no rank, no
   * class, no bonus and no video, and a layout measured from its own rows
   * would put a different grid on screen for every year. These widths are the
   * same grid for all of them, and they add up to less than the page.
   *
   * The club is its mark alone, with the name on hover — the one column whose
   * content ("Washington Nationals") is three times the width of anything it
   * has to line up with.
   */
  const cols: Column<DraftPick>[] = [
    {
      key: "round",
      label: "ROUND",
      align: "right",
      width: "4.25rem",
      sortValue: (p) => p.pick,
      render: (p) => <span className="text-ink-3">{p.round}</span>,
    },
    {
      key: "pick",
      label: "PICK",
      align: "right",
      width: "3.5rem",
      sortValue: (p) => p.pick,
      render: (p) => p.pick,
    },
    {
      key: "rank",
      label: "RANK",
      align: "right",
      width: "3.5rem",
      sortValue: (p) => p.rank,
      render: (p) => <span className="text-ink-3">{p.rank ?? "—"}</span>,
    },
    {
      key: "team",
      label: "TEAM",
      align: "center",
      width: "4rem",
      sortValue: (p) => p.team,
      render: (p) => (
        <TeamLink
          id={p.teamId}
          name={p.team}
          text=""
          title={p.team}
          className="justify-center"
        />
      ),
    },
    {
      key: "name",
      label: "NAME",
      width: "9.5rem",
      sortValue: (p) => p.name,
      render: (p) =>
        p.pass ? (
          <span className="text-ink-3">PASS</span>
        ) : (
          <PlayerLink id={p.id} headshot={false}>
            {p.name}
          </PlayerLink>
        ),
    },
    {
      key: "school",
      label: "SCHOOL",
      width: "11rem",
      sortValue: (p) => p.school,
      /* Clipped at the width it is given, so the whole name is the hover. */
      render: (p) => <span title={p.school}>{p.school}</span>,
    },
    {
      key: "country",
      label: "BIRTHPLACE",
      width: "6rem",
      sortValue: (p) => p.country,
      /* The town is the hover — the column has room for the country only. */
      render: (p) => <span title={p.home || undefined}>{p.country || "—"}</span>,
    },
    {
      key: "position",
      label: "POS",
      align: "center",
      width: "3.5rem",
      sortValue: (p) => p.position,
      render: (p) => p.position || "—",
    },
    {
      key: "bt",
      label: "B/T",
      align: "center",
      width: "3.25rem",
      render: (p) => (p.bats || p.throws ? `${p.bats || "?"}/${p.throws || "?"}` : "—"),
    },
    {
      key: "class",
      label: "CLASS",
      align: "center",
      width: "4rem",
      sortValue: (p) => p.schoolClass,
      render: (p) => <span className="text-ink-3">{p.schoolClass || "—"}</span>,
    },
    {
      key: "video",
      label: "VIDEO",
      align: "center",
      width: "3.25rem",
      render: (p) =>
        p.video ? (
          <a
            href={p.video}
            target="_blank"
            rel="noreferrer"
            title={`Scouting video — ${p.name}`}
            className="text-ink-3 hover:text-accent"
          >
            ▶
          </a>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "info",
      label: "PLAYER INFO",
      align: "right",
      width: "5.5rem",
      render: (p) => (
        <span className="block leading-tight">
          {p.height || "—"}
          {p.weight ? ` ${p.weight}lbs` : ""}
          <span className="block text-[10px] text-ink-3">DOB {dob(p.born)}</span>
        </span>
      ),
    },
    {
      key: "bonus",
      label: "SIGNING BONUS",
      align: "right",
      width: "6.5rem",
      sortValue: (p) => p.bonus,
      render: (p) => (
        <span className="block leading-tight">
          {money(p.bonus)}
          <span className="block text-[10px] text-ink-3">
            {p.pickValue === null ? "—" : `SLOT ${money(p.pickValue)}`}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect label="ROUND" value={f.round} options={options.rounds} onChange={(v) => set("round", v)} />
        <FilterSelect label="POSITION" value={f.position} options={options.positions} onChange={(v) => set("position", v)} />
        <FilterSelect label="TEAM" value={f.team} options={options.teams} onChange={(v) => set("team", v)} />
        <FilterSelect label="STATE" value={f.state} options={options.states} onChange={(v) => set("state", v)} />
        <FilterSelect label="BIRTHPLACE" value={f.country} options={options.countries} onChange={(v) => set("country", v)} />
        <input
          type="search"
          aria-label="Name"
          placeholder="NAME"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          className={`${FILTER_CONTROL} w-36 ${f.name ? "border-accent" : ""}`}
        />
        <input
          type="search"
          aria-label="School"
          placeholder="SCHOOL"
          value={f.school}
          onChange={(e) => set("school", e.target.value)}
          className={`${FILTER_CONTROL} w-36 ${f.school ? "border-accent" : ""}`}
        />
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
      <DataTable<DraftPick>
        columns={cols}
        rows={rows}
        /* A year with more than one phase can repeat a pick number. */
        rowKey={(p, i) => `${p.round}-${p.pick}-${p.id ?? i}`}
        pageSize={50}
        paginate
        /* The page scrolls, not the table — a draft is read straight down. */
        maxHeight="none"
        emptyLabel="NO PICKS MATCH THESE FILTERS"
      />
    </div>
  );
}
