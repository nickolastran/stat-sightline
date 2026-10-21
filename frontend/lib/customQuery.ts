import type { Role } from "./api";
import { flipName } from "./advanced";
import type { FilterState } from "./filters";
import { MIN_SAMPLE } from "./metrics";
import { statcastSearch } from "./statcast";

/*
 * CUSTOM QUERIES: a leaderboard over the same pitch-level slice the Pitching
 * and Hitting modules filter — one stat, every pitcher (or hitter) in the
 * league, on the pitches that match. "Whiff rate on sliders at two strikes
 * against lefties" is one row of controls, not a SQL prompt.
 *
 * The board is Savant's Statcast search grouped by player: one league-wide
 * request, so it answers on the deployed site, which has no warehouse, and
 * for every Statcast season. The filters keep the dashboard's names in the
 * URL, so a row links into that player's module on the same slice.
 *
 * ponytail: no RUNNERS ON filter — none of Savant's documented spellings of
 * it filters anything. Find the value its search form sends to add it.
 */

/** What a stat's sample is counted in, as the board names it. */
export const SAMPLE_LABEL = {
  pitches: "PITCHES",
  pa: "PA",
  swings: "SWINGS",
  bip: "BBE",
} as const;
type Sample = keyof typeof SAMPLE_LABEL;

/** Which end of a stat leads the board, per role. */
type Dir = Record<Role, "asc" | "desc">;
const HITTER_HIGH: Dir = { batter: "desc", pitcher: "asc" }; // good for the hitter
const PITCHER_HIGH: Dir = { batter: "asc", pitcher: "desc" }; // good for the pitcher
const HIGH: Dir = { batter: "desc", pitcher: "desc" }; // neither; most first

/** One grouped Savant row, numbers already read. */
export type SavantRow = Record<string, string>;

export interface QueryStat {
  key: string;
  label: string;
  title: string;
  kind: "rate" | "pct" | "num";
  sample: Sample;
  dir: Dir;
  value: (r: SavantRow, role: Role) => number | null;
}

const num = (s: string | undefined) => {
  const n = Number.parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};
const col = (name: string) => (r: SavantRow) => num(r[name]);
/** Savant writes its percentages 0-100; the board's formatter reads 0-1. */
const pctCol = (name: string) => (r: SavantRow) => {
  const v = num(r[name]);
  return v === null ? null : v / 100;
};
const ratio = (top: string, bottom: string) => (r: SavantRow) => {
  const t = num(r[top]);
  const b = num(r[bottom]);
  return t === null || !b ? null : t / b;
};

export const QUERY_STATS: QueryStat[] = [
  { key: "xwoba", label: "xwOBA", title: "Expected wOBA from contact quality, walks and strikeouts", kind: "rate", sample: "pa", dir: HITTER_HIGH, value: col("xwoba") },
  { key: "woba", label: "wOBA", title: "Weighted on-base average", kind: "rate", sample: "pa", dir: HITTER_HIGH, value: col("woba") },
  { key: "ba", label: "AVG", title: "Batting average", kind: "rate", sample: "pa", dir: HITTER_HIGH, value: col("ba") },
  { key: "xba", label: "xBA", title: "Expected batting average", kind: "rate", sample: "pa", dir: HITTER_HIGH, value: col("xba") },
  { key: "slg", label: "SLG", title: "Slugging percentage", kind: "rate", sample: "pa", dir: HITTER_HIGH, value: col("slg") },
  { key: "k", label: "K%", title: "Strikeouts per plate appearance", kind: "pct", sample: "pa", dir: PITCHER_HIGH, value: pctCol("k_percent") },
  { key: "bb", label: "BB%", title: "Walks per plate appearance", kind: "pct", sample: "pa", dir: HITTER_HIGH, value: pctCol("bb_percent") },
  { key: "whiff", label: "WHIFF%", title: "Whiffs per swing", kind: "pct", sample: "swings", dir: PITCHER_HIGH, value: ratio("whiffs", "swings") },
  { key: "swing", label: "SWING%", title: "Swings per pitch", kind: "pct", sample: "pitches", dir: HIGH, value: ratio("swings", "pitches") },
  { key: "ev", label: "AVG EV", title: "Average exit velocity on balls in play, mph", kind: "num", sample: "bip", dir: HITTER_HIGH, value: col("launch_speed") },
  { key: "hardhit", label: "HARD-HIT%", title: "Balls in play at 95+ mph", kind: "pct", sample: "bip", dir: HITTER_HIGH, value: pctCol("hardhit_percent") },
  { key: "barrel", label: "BARREL%", title: "Barrels per ball in play", kind: "pct", sample: "bip", dir: HITTER_HIGH, value: pctCol("barrels_per_bbe_percent") },
  { key: "velo", label: "VELO", title: "Average pitch velocity, mph", kind: "num", sample: "pitches", dir: HIGH, value: col("velocity") },
  { key: "spin", label: "SPIN", title: "Average spin rate, rpm", kind: "num", sample: "pitches", dir: HIGH, value: col("spin_rate") },
  {
    key: "rv",
    label: "RV/100",
    title: "Run value per 100 pitches, from this role's side",
    kind: "num",
    sample: "pitches",
    dir: HIGH,
    value: (r, role) => num(r[role === "pitcher" ? "pitcher_run_value_per_100" : "batter_run_value_per_100"]),
  },
];

export const findStat = (key: string | undefined) =>
  QUERY_STATS.find((s) => s.key === key) ?? QUERY_STATS[0];

/** The pitch-type menu: Statcast's own codes, which is what Savant filters on. */
export const QUERY_PITCH_TYPES = [
  ["FF", "Four-seam"],
  ["SI", "Sinker"],
  ["FC", "Cutter"],
  ["SL", "Slider"],
  ["ST", "Sweeper"],
  ["CU", "Curveball"],
  ["KC", "Knuckle curve"],
  ["CH", "Changeup"],
  ["FS", "Splitter"],
] as const;

/** The dashboard's slice as Savant's search parameters. */
export function savantFilters(f: FilterState): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.dateFrom) p.game_date_gt = f.dateFrom;
  if (f.dateTo) p.game_date_lt = f.dateTo;
  /* "OTH" is the dashboard's fold of everything unnamed — not a code. */
  const types = f.pitchTypes?.filter((c) => c !== "OTH") ?? [];
  if (types.length) p.hfPT = types.map((c) => `${c}|`).join("");
  /* A ball count or a strike count alone is every count that has it. */
  if (f.balls !== null || f.strikes !== null) {
    const counts: string[] = [];
    for (let b = 0; b <= 3; b++)
      for (let s = 0; s <= 2; s++)
        if ((f.balls === null || f.balls === b) && (f.strikes === null || f.strikes === s))
          counts.push(`${b}${s}|`);
    p.hfC = counts.join("");
  }
  if (f.stand) p.batter_stands = f.stand;
  if (f.pThrows) p.pitcher_throws = f.pThrows;
  if (f.twoOuts) p.hfOuts = "2|";
  if (f.lateInnings) p.hfInn = "7|8|9|10|"; // Savant's 10 is every extra inning
  return p;
}

export interface QueryRow {
  id: number;
  name: string;
  value: number | null;
  /** The stat's own sample, and the pitches behind it. */
  n: number;
  pitches: number;
}

/** A stat's sample off a grouped row. */
const sampleOf = (r: SavantRow, sample: Sample) => num(r[sample]) ?? 0;

/** The rows that clear the floor, best first for this role. Pure, for the check. */
export function rankRows(rows: SavantRow[], stat: QueryStat, role: Role, min: number): QueryRow[] {
  const sign = stat.dir[role] === "desc" ? -1 : 1;
  return rows
    .map((r) => ({
      id: Number(r.player_id),
      name: flipName(r.player_name ?? ""),
      value: stat.value(r, role),
      n: sampleOf(r, stat.sample),
      pitches: num(r.pitches) ?? 0,
    }))
    .filter((r) => r.id && r.value !== null && r.n >= min)
    .sort((a, b) => sign * (a.value! - b.value!));
}

/** Everything the board is built from, out of the URL. */
export interface Query {
  role: Role;
  season: number;
  stat: QueryStat;
  min: number;
}

export const pickQuery = (
  sp: { role?: string; season?: string; stat?: string; min?: string },
  current: number,
  first: number,
): Query => {
  const season = Number(sp.season);
  const min = Number(sp.min);
  return {
    role: sp.role === "batter" ? "batter" : "pitcher",
    season: Number.isInteger(season) && season >= first && season <= current ? season : current,
    stat: findStat(sp.stat),
    min: sp.min && Number.isInteger(min) && min >= 0 ? min : MIN_SAMPLE,
  };
};

/** The board: one grouped Savant search, ranked. */
export async function getQueryBoard(q: Query, f: FilterState): Promise<QueryRow[]> {
  const rows = await statcastSearch(
    {
      type: "",
      group_by: "name",
      player_type: q.role,
      min_pitches: "0",
      min_results: "0",
      min_pas: "0",
      ...savantFilters(f),
    },
    q.season,
  );
  return rankRows(rows, q.stat, q.role, q.min);
}
