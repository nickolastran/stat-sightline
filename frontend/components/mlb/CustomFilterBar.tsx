import ParamSelect from "@/components/mlb/ParamSelect";
import ParamMultiSelect, {
  type MultiGroup,
} from "@/components/mlb/ParamMultiSelect";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import { LEADER_POSITIONS, type Club } from "@/lib/mlb";
import {
  ADV_FIRST_SEASON,
  catalogFor,
  colGroups,
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
 * The columns get a bar of their own, a picker per band, rather than one
 * COLUMNS pop-out holding all five. A single pop-out has to be as tall as the
 * standard line — thirty-three boxes — before it shows a reader the four
 * shorter bands at all, and it puts the choice of a batted-ball column behind
 * the same click as the choice of a club. Split, each band opens on its own
 * and the bar says at a glance how many of each are on the board.
 *
 * All five write the same `?cols=`, so each carries what the others picked:
 * see `keep` on ParamMultiSelect.
 *
 * A server component holding client controls, the same shape the ABS bar
 * takes — the club list behind the team picker is a cached MLB read, resolved
 * once here rather than fetched again in the browser — and it sits outside
 * the section's Suspense boundary, which is what lets a pop-out stay open
 * while the board it just filtered re-fetches behind it.
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
  const catalogue = catalogFor(query.group);
  const picked = new Set(query.cols);

  return (
    <div className="mb-3 space-y-px">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-bg px-3 py-2">
        <ParamSelect
          param="group"
          label="PLAYERS"
          value={query.group}
          options={CUSTOM_GROUPS}
        />
        <SeasonSelect value={season} first={ADV_FIRST_SEASON} last={current} />
        <ParamSelect
          param="min"
          label="MINIMUM"
          value={query.min}
          options={CUSTOM_MINS}
        />
        <ParamSelect
          param="league"
          label="LEAGUE"
          value={query.league}
          options={CUSTOM_LEAGUES}
        />
        <ParamSelect
          param="div"
          label="DIVISION"
          value={query.division}
          options={CUSTOM_DIVISIONS}
        />
        <ParamSelect
          param="team"
          label="CLUB"
          value={query.team}
          options={teamOptions(clubs)}
        />
        <ParamSelect
          param="pos"
          label="POS"
          value={query.position}
          options={LEADER_POSITIONS}
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
              value={query.cols.filter((k) => mine.has(k))}
              /* The other bands' picks, carried through this write. */
              keep={query.cols.filter((k) => !mine.has(k))}
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
        <span className="ml-auto text-[10px] tracking-wider text-ink-3 tabular-nums">
          {picked.size} OF {catalogue.length} ON THE BOARD
        </span>
      </div>
    </div>
  );
}

/** The thirty clubs, plus the unfiltered board they all sit under. */
function teamOptions(clubs: Club[]) {
  return [
    { value: "all", label: "ALL CLUBS" },
    ...clubs.map((c) => ({ value: String(c.id), label: c.name.toUpperCase() })),
  ];
}
