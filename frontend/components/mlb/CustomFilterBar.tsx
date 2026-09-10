"use client";

import { useState } from "react";
import ParamSelect from "@/components/mlb/ParamSelect";
import ParamMultiSelect, {
  type MultiGroup,
} from "@/components/mlb/ParamMultiSelect";
import { useSetParam } from "@/lib/useSetParam";
import { LEADER_POSITIONS, type Club } from "@/lib/mlb";
import {
  ADV_FIRST_SEASON,
  catalogFor,
  colGroups,
  CUSTOM_DEFAULTS,
  CUSTOM_DIVISIONS,
  CUSTOM_GROUPS,
  CUSTOM_LEAGUES,
  CUSTOM_MINS,
  type AdvCol,
  type CustomQuery,
} from "@/lib/advanced";

/*
 * Everything a custom board is built from: who is on it on the top bar, and
 * which figures it prints on the one below.
 *
 * Nothing here navigates on its own. Every control writes to a draft held
 * beside the applied query, and UPDATE sends the lot in one go — the board is
 * a request to MLB and up to four to Savant, and a reader assembling a
 * fifteen-column line would otherwise spend that fifteen times over on boards
 * they were only passing through. It also makes a half-built selection
 * harmless: ticking the first of five columns doesn't blank the table while
 * you tick the rest.
 *
 * The columns get a bar of their own, a picker per band, rather than one
 * COLUMNS pop-out holding all five. A single pop-out has to be as tall as the
 * standard line — thirty-three boxes — before it shows a reader the four
 * shorter bands at all. Split, each band opens on its own and the bar says at
 * a glance how many of each are on the board.
 *
 * The club list behind the team picker is a cached MLB read handed down from
 * the page, so it costs nothing here, and the bar sits outside the section's
 * Suspense boundary — which is what lets a pop-out stay open while the board
 * behind it re-fetches.
 */

/** Long bands are dealt into two columns; the short ones read as one list. */
const TWO_COLUMN_AT = 18;

/** The catalogue, split back into the bands the table heads its columns with. */
function bands(cols: AdvCol[]): { label: string; options: AdvCol[] }[] {
  let at = 0;
  return colGroups(cols).map((b) => {
    const options = cols.slice(at, at + b.span);
    at += b.span;
    return { label: b.label, options };
  });
}

/** "AVG — Batting average", with the long half of a two-clause title cut. */
const optionOf = (c: AdvCol) => ({
  value: c.key,
  label: `${c.label} — ${c.title.split("—")[0].trim()}`,
  short: c.label,
});

/*
 * A band as the pop-out lays it out. Its options are dealt into unlabelled
 * groups rather than one long one, because the pop-out's own grid is what
 * turns groups into columns — a single group is a single column however wide
 * the box is.
 */
function groupsOf(options: AdvCol[], columns: number): MultiGroup[] {
  const per = Math.ceil(options.length / columns);
  return Array.from({ length: columns }, (_, i) => ({
    options: options.slice(i * per, (i + 1) * per).map(optionOf),
  }));
}

/** The thirty clubs, plus the unfiltered board they all sit under. */
const teamOptions = (clubs: Club[]) => [
  { value: "all", label: "ALL CLUBS" },
  ...clubs.map((c) => ({ value: String(c.id), label: c.name.toUpperCase() })),
];

const yearOptions = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => ({
    value: String(last - i),
    label: String(last - i),
  }));

/** What the draft is: the applied query, plus the season it was read at. */
type Draft = CustomQuery & { season: number };

export default function CustomFilterBar({
  query,
  season,
  current,
  clubs,
}: {
  query: CustomQuery;
  season: number;
  current: number;
  clubs: Club[];
}) {
  const setParam = useSetParam();
  /* Seeded once per applied query: the page keys this component on what it
     applied, so an UPDATE that lands — or a reader going back — remounts it
     with the draft already matching, rather than leaving an effect to notice
     and undo itself. */
  const [draft, setDraft] = useState<Draft>({ ...query, season });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const catalogue = catalogFor(draft.group);

  /* Changing group changes what the columns even are, so the old picks would
     be filtered away to nothing on the next read. Better the new group's own
     opening line than a board that clears itself. */
  const setGroup = (group: string) =>
    setDraft((d) => ({
      ...d,
      group: group as CustomQuery["group"],
      cols: CUSTOM_DEFAULTS[group as CustomQuery["group"]],
    }));

  /* Compared field by field rather than serialised: `sort` isn't a control,
     and two objects that mean the same thing can still stringify apart. */
  const pending =
    draft.group !== query.group ||
    draft.season !== season ||
    draft.min !== query.min ||
    draft.league !== query.league ||
    draft.division !== query.division ||
    draft.team !== query.team ||
    draft.position !== query.position ||
    draft.cols.join("|") !== query.cols.join("|");

  const update = (e: React.FormEvent) => {
    e.preventDefault();
    setParam({
      group: draft.group === "hitting" ? null : draft.group,
      season: String(draft.season),
      min: draft.min === "q" ? null : draft.min,
      league: draft.league === "all" ? null : draft.league,
      div: draft.division === "all" ? null : draft.division,
      team: draft.team === "all" ? null : draft.team,
      pos: draft.position === "all" ? null : draft.position,
      /* Always written, even empty: an absent `cols` is a first visit and
         opens on the default line, where an empty one is a reader who
         cleared every box and means it. */
      cols: draft.cols.join("|"),
    });
  };

  return (
    <form onSubmit={update} className="mb-3 space-y-px">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-bg px-3 py-2">
        <ParamSelect
          param="group"
          label="PLAYERS"
          value={draft.group}
          options={CUSTOM_GROUPS}
          onChange={setGroup}
        />
        <ParamSelect
          param="season"
          label="SEASON"
          value={String(draft.season)}
          options={yearOptions(ADV_FIRST_SEASON, current)}
          onChange={(v) => set("season", Number(v))}
        />
        <ParamSelect
          param="min"
          label="MINIMUM"
          value={draft.min}
          options={CUSTOM_MINS}
          onChange={(v) => set("min", v)}
        />
        <ParamSelect
          param="league"
          label="LEAGUE"
          value={draft.league}
          options={CUSTOM_LEAGUES}
          onChange={(v) => set("league", v)}
        />
        <ParamSelect
          param="div"
          label="DIVISION"
          value={draft.division}
          options={CUSTOM_DIVISIONS}
          onChange={(v) => set("division", v)}
        />
        <ParamSelect
          param="team"
          label="CLUB"
          value={draft.team}
          options={teamOptions(clubs)}
          onChange={(v) => set("team", v)}
        />
        <ParamSelect
          param="pos"
          label="POS"
          value={draft.position}
          options={LEADER_POSITIONS}
          onChange={(v) => set("position", v)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-bg px-3 py-2">
        <span className="text-[10px] tracking-[0.2em] text-ink-3">COLUMNS</span>
        {bands(catalogue).map((band) => {
          const keys = band.options.map((c) => c.key);
          const mine = new Set(keys);
          const columns = band.options.length > TWO_COLUMN_AT ? 2 : 1;
          return (
            <ParamMultiSelect
              key={band.label}
              param="cols"
              label={band.label}
              value={draft.cols.filter((k) => mine.has(k))}
              /* The other bands' picks, carried through this write. */
              keep={draft.cols.filter((k) => !mine.has(k))}
              onChange={(v) => set("cols", v)}
              groups={groupsOf(band.options, columns)}
              quick={[{ label: "ALL", values: keys }]}
              cols={columns}
              width={columns === 2 ? "w-[34rem]" : "w-[17rem]"}
              /* These sit at the left of their bar, so the box opens
                 rightwards — hung off its right edge a wide one would run
                 off the side of the screen. */
              align="left"
            />
          );
        })}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[10px] tracking-wider text-ink-3 tabular-nums">
            {draft.cols.length} OF {catalogue.length} CHOSEN
          </span>
          <button
            type="submit"
            disabled={!pending}
            className={`border px-3 py-1 text-[10px] tracking-[0.2em] ${
              pending
                ? "border-accent bg-accent font-bold text-white hover:opacity-90"
                : "border-line text-ink-3"
            }`}
          >
            UPDATE
          </button>
        </span>
      </div>
    </form>
  );
}
