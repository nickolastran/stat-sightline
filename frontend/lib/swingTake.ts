import type { Pitch } from "./api";
import { isSwing } from "./metrics";

/*
 * Swing/take run value by attack zone, the way Savant's Swing/Take profile
 * reads a hitter: every pitch's change in run expectancy, credited to whether
 * he swung or took, in four rings out from the middle of his zone.
 *
 * The rings are Tango's: the zone is measured out from its centre in
 * percent — 10 in. either side of the plate's middle (half the plate plus a
 * ball), and half the hitter's own zone height plus a ball's radius up and
 * down. Heart is inside 67%, shadow 67-133%, chase 133-200%, waste beyond.
 * Checked against Savant's own swing-take board for six 2026 hitters: within
 * about a run per zone.
 */

export const ATTACK_ZONES = ["heart", "shadow", "chase", "waste"] as const;
export type AttackZone = (typeof ATTACK_ZONES)[number];

const HALF_WIDTH = 10 / 12; // ft
const BALL_RADIUS = 1.45 / 12; // ft

/** Which ring a pitch crossed in, or null when it wasn't tracked. */
export function attackZone(p: Pitch): AttackZone | null {
  const { plate_x: x, plate_z: z, sz_top: top, sz_bot: bot } = p;
  if (x === null || z === null || top === null || bot === null) return null;
  const r = Math.max(
    Math.abs(x) / HALF_WIDTH,
    Math.abs(z - (top + bot) / 2) / ((top - bot) / 2 + BALL_RADIUS),
  );
  return r < 0.67 ? "heart" : r < 1.33 ? "shadow" : r < 2 ? "chase" : "waste";
}

export interface SwingTakeRow {
  zone: AttackZone | "all";
  pitches: number;
  swings: number;
  /** Runs won (+) or lost (−) on swings, on takes, and both. */
  swingRuns: number;
  takeRuns: number;
  runs: number;
}

/** One row per ring, and a total — pitches with no run value sit out. */
export function swingTake(pitches: Pitch[]): SwingTakeRow[] {
  const blank = (zone: SwingTakeRow["zone"]): SwingTakeRow => ({
    zone, pitches: 0, swings: 0, swingRuns: 0, takeRuns: 0, runs: 0,
  });
  const rows = new Map(ATTACK_ZONES.map((z) => [z, blank(z)]));
  const all = blank("all");
  for (const p of pitches) {
    const zone = attackZone(p);
    if (!zone || p.run_value == null) continue;
    const swung = isSwing(p);
    for (const r of [rows.get(zone)!, all]) {
      r.pitches += 1;
      r.runs += p.run_value;
      if (swung) {
        r.swings += 1;
        r.swingRuns += p.run_value;
      } else r.takeRuns += p.run_value;
    }
  }
  return [...rows.values(), all];
}
