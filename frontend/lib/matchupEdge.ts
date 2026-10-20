import { savantCsv } from "./advanced";
import { getPitcherSideMix } from "./api";
import type { LineupLine, TeamStatCol } from "./mlb";
import { statcastSearch } from "./statcast";

/*
 * A hitter against tonight's starter by pitch mix — what he should do against
 * this arm whether or not the two have ever met. For each pitch the starter
 * throws, the hitter's season xwOBA against that pitch type and the
 * starter's xwOBA allowed with it are each pulled toward the league's mark
 * on that pitch, then added as edges over it; the pitches are weighted by how
 * often the starter throws them.
 *
 * Both sides come off Savant's pitch-arsenal board: one CSV per role for the
 * whole league, so a lineup of nine costs two cached fetches, not eighteen
 * seasons of pitches.
 *
 * The board doesn't carry handedness, and a starter's mix against lefties
 * can differ a lot from his mix against righties, so a caller that knows the
 * hands passes a Platoon: the starter's mix against each batter side (the
 * warehouse, or Savant's search on the deployed site), and which side each
 * hitter stands in. Each hitter is then weighted by the mix his side sees.
 *
 * ponytail: only the mix splits. The xwOBA figures on each pitch are still
 * season-wide, not the hitter's against that hand or the pitcher's against
 * that side; split those too if the mix alone undersells the platoon.
 */

/** One player's season against (or with) one pitch type. */
export interface MixRow {
  id: number;
  type: string;
  /** Share of the player's pitches, 0-100. Only the pitcher's is read. */
  usage: number;
  pa: number;
  xwoba: number | null;
}

export interface ArsenalBoards {
  bat: MixRow[];
  arm: MixRow[];
}

const toRows = (csv: Record<string, string>[]): MixRow[] =>
  csv.map((r) => ({
    id: Number(r.player_id),
    type: r.pitch_type,
    usage: Number(r.pitch_usage) || 0,
    pa: Number(r.pa) || 0,
    xwoba: r.est_woba ? Number(r.est_woba) : null,
  }));

/** The season's arsenal board for every hitter and every pitcher. */
export async function getArsenalBoards(season: number): Promise<ArsenalBoards> {
  const board = (type: string) =>
    savantCsv("pitch-arsenal-stats", {
      type,
      pitchType: "",
      year: String(season),
      team: "",
      min: "1",
    }).then(toRows);
  const [bat, arm] = await Promise.all([board("batter"), board("pitcher")]);
  return { bat, arm };
}

export type Side = "L" | "R";

/** A pitcher's pitches by type against each batter side, as counts. */
export type SideMix = Record<Side, Record<string, number>>;

/** A pitcher's split mix, and the side each hitter stands in against him. */
export interface Platoon {
  mix: SideMix;
  sides: Record<number, Side | undefined>;
}

/** The side a hitter stands in against this arm — a switch-hitter turns
 *  around to face him; anything unknown is undefined, the whole mix. */
export const sideOf = (bats?: string | null, throws?: string | null): Side | undefined =>
  bats === "L" || bats === "R"
    ? bats
    : bats === "S" && (throws === "L" || throws === "R")
      ? throws === "L" ? "R" : "L"
      : undefined;

/** One pitcher's season mix against each batter side: the warehouse when it
 *  answers, Savant's grouped search when it doesn't. */
export async function getSideMix(pitcherId: number, season: number): Promise<SideMix> {
  return getPitcherSideMix(pitcherId, season).catch(async () => {
    const side = async (stand: Side) =>
      Object.fromEntries(
        (
          await statcastSearch(
            {
              type: "",
              group_by: "pitch-type",
              player_type: "pitcher",
              "pitchers_lookup[]": String(pitcherId),
              batter_stands: stand,
              hfGT: "R|PO|", // the warehouse's season holds October too
              min_pitches: "0",
              min_results: "0",
              min_pas: "0",
            },
            season,
          )
        )
          .filter((r) => r.pitch_type)
          .map((r) => [r.pitch_type, Number(r.pitches) || 0]),
      );
    const [L, R] = await Promise.all([side("L"), side("R")]);
    return { L, R };
  });
}

/** Pitches of the season-wide mix folded into a split one — a reliever who
 *  has seen six lefties throws to them mostly as he does to everyone. */
export const REGRESS_PITCHES = 100;

/** PAs of league average folded into every figure — a hitter with 12 PAs
 *  against sliders reads mostly as the league does, one with 200 as himself. */
export const REGRESS_PA = 50;

/** A pitch has to be this much of the mix, in percent, to be named as a
 *  hitter's best or worst — a show-me curve shouldn't headline the card. */
const NAMED_USAGE = 10;

export const EDGE_COLS: TeamStatCol[] = [
  { key: "proj", label: "xwOBA", title: "Projected xwOBA against tonight's starter, by his pitch mix" },
  { key: "diff", label: "+/-", title: "Projection over the league's average xwOBA" },
  { key: "best", label: "BEST", title: "The pitch in his mix this hitter should do most with" },
  { key: "worst", label: "WORST", title: "The pitch in his mix this hitter should do least with" },
  { key: "pa", label: "PA", title: "The hitter's PAs this season against these pitch types" },
];

/** ".331", "+.018" — rates the way a box score writes them. */
const rate = (v: number) => v.toFixed(3).replace(/^(-?)0\./, "$1.");
const signed = (v: number) => (v >= 0 ? "+" : "") + rate(v);

/** One pitch in the starter's mix, as this hitter should fare against it.
 *  Every xwOBA is already pulled toward the league's mark on the pitch. */
export interface PitchEdge {
  type: string;
  /** Share of the starter's mix, 0-100. */
  usage: number;
  hitter: number;
  pitcher: number;
  league: number;
  /** The hitter's edge and the pitcher's edge over the league, added. */
  proj: number;
  /** The hitter's PAs this season against the pitch. */
  pa: number;
}

/**
 * The per-pitch scorer for one pitcher, built once per board: the league on
 * each pitch type and the pitcher's mix. Null when the pitcher has nothing on
 * the board — no mix, nothing to weight.
 */
function scorer(boards: ArsenalBoards, pitcherId: number, platoon?: Platoon | null) {
  const season = boards.arm.filter((r) => r.id === pitcherId && r.usage > 0);
  if (season.length === 0) return null;
  const onBoard = new Map(season.map((r) => [r.type, r]));
  const seasonUsed = season.reduce((n, r) => n + r.usage, 0);

  /** The mix this hitter's side sees — the split, pulled toward the season's
   *  mix by REGRESS_PITCHES — or the season's when his side isn't known. A
   *  pitch only in the split has no board line, so it reads as the league. */
  const mixFor = (batterId: number): MixRow[] => {
    const side = platoon?.sides[batterId];
    const split = side && platoon!.mix[side];
    if (!split) return season;
    const n = Object.values(split).reduce((a, b) => a + b, 0);
    return [...new Set([...onBoard.keys(), ...Object.keys(split)])]
      .map((type) => ({
        ...(onBoard.get(type) ?? { id: pitcherId, type, pa: 0, xwoba: null }),
        usage:
          (100 * ((split[type] ?? 0) + (REGRESS_PITCHES * (onBoard.get(type)?.usage ?? 0)) / seasonUsed)) /
          (n + REGRESS_PITCHES),
      }))
      .filter((r) => r.usage > 0);
  };

  /* The league on each pitch type, PA-weighted over every hitter. */
  const sums = new Map<string, { x: number; pa: number }>();
  let allX = 0;
  let allPa = 0;
  for (const r of boards.bat) {
    if (r.xwoba === null) continue;
    const s = sums.get(r.type) ?? { x: 0, pa: 0 };
    s.x += r.xwoba * r.pa;
    s.pa += r.pa;
    sums.set(r.type, s);
    allX += r.xwoba * r.pa;
    allPa += r.pa;
  }
  const league = allPa ? allX / allPa : 0.315;
  const leagueOn = (type: string) => {
    const s = sums.get(type);
    return s?.pa ? s.x / s.pa : league;
  };
  const shrunk = (r: MixRow | undefined, lg: number) =>
    r && r.xwoba !== null ? (r.xwoba * r.pa + lg * REGRESS_PA) / (r.pa + REGRESS_PA) : lg;

  /** The hitter's edges on every pitch in the mix, most-thrown first. */
  const edges = (batterId: number): PitchEdge[] => {
    const mix = mixFor(batterId);
    const used = mix.reduce((n, r) => n + r.usage, 0);
    const mine = new Map(
      boards.bat.filter((r) => r.id === batterId).map((r) => [r.type, r]),
    );
    /* Added, so a good hitter facing a pitch that gets hit hard is better
       than either alone. */
    return mix
      .map((p) => {
        const lg = leagueOn(p.type);
        const hitter = shrunk(mine.get(p.type), lg);
        const pitcher = shrunk(p, lg);
        return {
          type: p.type,
          usage: (100 * p.usage) / used,
          hitter,
          pitcher,
          league: lg,
          proj: hitter + pitcher - lg,
          pa: mine.get(p.type)?.pa ?? 0,
        };
      })
      .sort((a, b) => b.usage - a.usage);
  };
  return { league, edges };
}

/** A hitter against one pitcher, pitch by pitch, plus the league line it's
 *  read against. Null when the pitcher is off the board. */
export function pitchEdges(
  boards: ArsenalBoards,
  pitcherId: number,
  batterId: number,
  platoon?: Platoon | null,
): { league: number; pitches: PitchEdge[] } | null {
  const s = scorer(boards, pitcherId, platoon);
  return s && { league: s.league, pitches: s.edges(batterId) };
}

/**
 * A lineup's projected xwOBA against one pitcher — each hitter weighted by his
 * PAs this season against the pitches in the mix, so a regular counts and a
 * bench bat barely does — beside the league's. Null when the pitcher is off
 * the board or none of the hitters is on it.
 */
export function lineupEdge(
  boards: ArsenalBoards,
  pitcherId: number,
  hitterIds: number[],
  platoon?: Platoon | null,
): { proj: number; league: number } | null {
  const s = scorer(boards, pitcherId, platoon);
  if (!s) return null;
  let x = 0;
  let w = 0;
  for (const id of hitterIds) {
    const mix = s.edges(id);
    const pa = mix.reduce((n, p) => n + p.pa, 0);
    x += pa * mix.reduce((n, p) => n + (p.usage / 100) * p.proj, 0);
    w += pa;
  }
  return w ? { proj: x / w, league: s.league } : null;
}

/**
 * Each hitter's projected line against one pitcher, by hitter id. Null when
 * the pitcher has nothing on the board — no mix, nothing to weight.
 */
export function edgeLines(
  boards: ArsenalBoards,
  pitcherId: number,
  batterIds: number[],
  platoon?: Platoon | null,
): Record<number, LineupLine> | null {
  const s = scorer(boards, pitcherId, platoon);
  if (!s) return null;

  return Object.fromEntries(
    batterIds.map((id) => {
      const mix = s.edges(id);
      const proj = mix.reduce((n, p) => n + (p.usage / 100) * p.proj, 0);
      const named = mix.some((p) => p.usage >= NAMED_USAGE)
        ? mix.filter((p) => p.usage >= NAMED_USAGE)
        : mix;
      /* Ranked on the figure the cell shows, so BEST never reads lower than WORST. */
      const ranked = [...named].sort((a, b) => b.proj - a.proj);
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      return [
        id,
        {
          proj: rate(proj),
          diff: signed(proj - s.league),
          best: `${best.type} ${rate(best.proj)}`,
          worst: ranked.length > 1 ? `${worst.type} ${rate(worst.proj)}` : null,
          pa: mix.reduce((n, p) => n + p.pa, 0),
        },
      ];
    }),
  );
}
