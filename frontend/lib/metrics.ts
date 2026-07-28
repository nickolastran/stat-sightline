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
