import { savantCsv } from "./advanced";
import type { LineupLine, TeamStatCol } from "./mlb";

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
 * ponytail: no platoon split — the board doesn't carry handedness, and a
 * starter's mix against lefties can differ a lot from his mix against
 * righties. Pull it from the per-pitch search if the edges need it.
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
function scorer(boards: ArsenalBoards, pitcherId: number) {
  const mix = boards.arm.filter((r) => r.id === pitcherId && r.usage > 0);
  if (mix.length === 0) return null;

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

  const used = mix.reduce((n, r) => n + r.usage, 0);

  /** The hitter's edges on every pitch in the mix, most-thrown first. */
  const edges = (batterId: number): PitchEdge[] => {
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
): { league: number; pitches: PitchEdge[] } | null {
  const s = scorer(boards, pitcherId);
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
): { proj: number; league: number } | null {
  const s = scorer(boards, pitcherId);
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
): Record<number, LineupLine> | null {
  const s = scorer(boards, pitcherId);
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
