import type { Pitch } from "./api";

/* Statcast description buckets. */
const SWING = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "foul",
  "foul_tip",
  "hit_into_play",
  "foul_bunt",
  "missed_bunt",
  "bunt_foul_tip",
]);
const WHIFF = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
]);
const CALLED_STRIKE = new Set(["called_strike"]);

const inZone = (p: Pitch) => p.zone !== null && p.zone >= 1 && p.zone <= 9;
const isSwing = (p: Pitch) => !!p.description && SWING.has(p.description);
const isWhiff = (p: Pitch) => !!p.description && WHIFF.has(p.description);
const isBattedBall = (p: Pitch) =>
  p.description === "hit_into_play" && p.launch_speed !== null;

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const rate = (num: number, den: number) => (den ? num / den : null);

export interface MetricSummary {
  pitches: number;
  avgVelo: number | null;
  avgSpin: number | null;
  whiffRate: number | null; // whiffs / swings
  cswRate: number | null; // (called strikes + whiffs) / pitches
  zoneRate: number | null;
  chaseRate: number | null; // swings out of zone / pitches out of zone
  avgExitVelo: number | null; // vs. batted balls allowed
  avgLaunchAngle: number | null;
  hardHitRate: number | null; // EV >= 95 among batted balls
}

export function summarize(pitches: Pitch[]): MetricSummary {
  const swings = pitches.filter(isSwing);
  const whiffs = pitches.filter(isWhiff);
  const called = pitches.filter(
    (p) => !!p.description && CALLED_STRIKE.has(p.description)
  );
  const outOfZone = pitches.filter((p) => p.zone !== null && !inZone(p));
  const located = pitches.filter((p) => p.zone !== null);
  const batted = pitches.filter(isBattedBall);
  const evs = batted.map((p) => p.launch_speed as number);

  return {
    pitches: pitches.length,
    avgVelo: mean(
      pitches.map((p) => p.release_speed).filter((v): v is number => v !== null)
    ),
    avgSpin: mean(
      pitches
        .map((p) => p.release_spin_rate)
        .filter((v): v is number => v !== null)
    ),
    whiffRate: rate(whiffs.length, swings.length),
    cswRate: rate(called.length + whiffs.length, pitches.length),
    zoneRate: rate(located.filter(inZone).length, located.length),
    chaseRate: rate(outOfZone.filter(isSwing).length, outOfZone.length),
    avgExitVelo: mean(evs),
    avgLaunchAngle: mean(
      batted
        .map((p) => p.launch_angle)
        .filter((v): v is number => v !== null)
    ),
    hardHitRate: rate(evs.filter((v) => v >= 95).length, evs.length),
  };
}

export interface ArsenalRow {
  code: string; // "OTH" for non-slot types
  name: string;
  n: number;
  usage: number;
  avgVelo: number | null;
  avgSpin: number | null;
  whiffRate: number | null;
  zoneRate: number | null;
  chaseRate: number | null;
  avgExitVelo: number | null;
  hardHitRate: number | null;
}

export function arsenalRows(
  pitches: Pitch[],
  namedTypes: ReadonlySet<string>
): ArsenalRow[] {
  const groups = new Map<string, { name: string; pitches: Pitch[] }>();
  for (const p of pitches) {
    const code =
      p.pitch_type && namedTypes.has(p.pitch_type) ? p.pitch_type : "OTH";
    const g = groups.get(code) ?? {
      name: code === "OTH" ? "Other" : p.pitch_name ?? code,
      pitches: [],
    };
    g.pitches.push(p);
    groups.set(code, g);
  }
  const total = pitches.length || 1;
  return [...groups.entries()]
    .map(([code, g]) => {
      const s = summarize(g.pitches);
      return {
        code,
        name: g.name,
        n: g.pitches.length,
        usage: g.pitches.length / total,
        avgVelo: s.avgVelo,
        avgSpin: s.avgSpin,
        whiffRate: s.whiffRate,
        zoneRate: s.zoneRate,
        chaseRate: s.chaseRate,
        avgExitVelo: s.avgExitVelo,
        hardHitRate: s.hardHitRate,
      };
    })
    .sort((a, b) => b.n - a.n);
}

/* Display formatters — "—" for null keeps table cells honest. */
export const fmt = {
  num: (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits)),
  int: (v: number | null) =>
    v === null ? "—" : Math.round(v).toLocaleString(),
  pct: (v: number | null, digits = 1) =>
    v === null ? "—" : `${(v * 100).toFixed(digits)}%`,
};

/* ── Uniform strike zone ────────────────────────────────────────────────
 *
 * Every batter gets a different zone (Statcast reports sz_bot..sz_top per
 * pitch, from the batter's stance), so raw plate_z smears a tall hitter's
 * belt-high pitch and a short one's letter-high pitch across the same row.
 * Normalizing z onto the rulebook rectangle below makes one square mean the
 * same thing for every batter faced — which is what the 3×3 grid needs to be
 * comparable at all. Horizontal is already uniform: the plate is the plate.
 */
export const ZONE = { x1: -0.83, x2: 0.83, z1: 1.5, z2: 3.5 } as const;

/** plate_z rescaled so this batter's zone lands on ZONE.z1..z2. */
export function normZ(p: Pitch): number | null {
  if (p.plate_z === null) return null;
  const { sz_top: top, sz_bot: bot } = p;
  if (top === null || bot === null || top - bot < 0.5) return p.plate_z; // sensor gap: plot raw
  return (
    ZONE.z1 + ((p.plate_z - bot) / (top - bot)) * (ZONE.z2 - ZONE.z1)
  );
}

/* Plate appearances that aren't at-bats — the BA denominator is every other
   terminal event. Listing the exclusions beats listing the ~20 out events. */
const NON_AB = new Set([
  "walk",
  "intent_walk",
  "hit_by_pitch",
  "sac_fly",
  "sac_bunt",
  "sac_fly_double_play",
  "sac_bunt_double_play",
  "catcher_interf",
]);
const HITS = new Set(["single", "double", "triple", "home_run"]);

export interface ZoneCell {
  row: number; // 0 = top of zone
  col: number; // 0 = left, catcher's view
  n: number; // pitches thrown here
  ab: number;
  hits: number;
  ba: number | null; // null until MIN_AB
}

/** Below this an average is noise, so it's shown as "—" rather than a color. */
export const MIN_AB = 10;

/** The 3×3 hot/cold grid: batting average allowed in each ninth of the zone. */
export function zoneGrid(pitches: Pitch[]): ZoneCell[] {
  const cells: ZoneCell[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      cells.push({ row, col, n: 0, ab: 0, hits: 0, ba: null });

  const wx = (ZONE.x2 - ZONE.x1) / 3;
  const wz = (ZONE.z2 - ZONE.z1) / 3;
  for (const p of pitches) {
    const z = normZ(p);
    if (p.plate_x === null || z === null) continue;
    const col = Math.floor((p.plate_x - ZONE.x1) / wx);
    const row = 2 - Math.floor((z - ZONE.z1) / wz); // row 0 = top
    if (col < 0 || col > 2 || row < 0 || row > 2) continue;
    const c = cells[row * 3 + col];
    c.n += 1;
    // events lands on the pitch that ended the PA, so each PA counts once.
    if (p.events && !NON_AB.has(p.events)) {
      c.ab += 1;
      if (HITS.has(p.events)) c.hits += 1;
    }
  }
  for (const c of cells) if (c.ab >= MIN_AB) c.ba = c.hits / c.ab;
  return cells;
}
