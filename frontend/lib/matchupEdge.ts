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

/**
 * Each hitter's projected line against one pitcher, by hitter id. Null when
 * the pitcher has nothing on the board — no mix, nothing to weight.
 */
export function edgeLines(
  boards: ArsenalBoards,
  pitcherId: number,
  batterIds: number[],
): Record<number, LineupLine> | null {
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
  const named = mix.some((r) => r.usage >= NAMED_USAGE)
    ? mix.filter((r) => r.usage >= NAMED_USAGE)
    : mix;

  return Object.fromEntries(
    batterIds.map((id) => {
      const mine = new Map(
        boards.bat.filter((r) => r.id === id).map((r) => [r.type, r]),
      );
      /* The hitter's edge and the pitcher's edge on a pitch, over the league
         on it — added, so a good hitter facing a pitch that gets hit hard is
         better than either alone. */
      const on = (p: MixRow) => {
        const lg = leagueOn(p.type);
        return shrunk(mine.get(p.type), lg) + shrunk(p, lg) - lg;
      };
      const proj = mix.reduce((n, p) => n + (p.usage / used) * on(p), 0);
      /* Ranked on the figure the cell shows, so BEST never reads lower than WORST. */
      const ranked = [...named].sort((a, b) => on(b) - on(a));
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      const pa = mix.reduce((n, p) => n + (mine.get(p.type)?.pa ?? 0), 0);
      return [
        id,
        {
          proj: rate(proj),
          diff: signed(proj - league),
          best: `${best.type} ${rate(on(best))}`,
          worst: ranked.length > 1 ? `${worst.type} ${rate(on(worst))}` : null,
          pa,
        },
      ];
    }),
  );
}
