import type { Pitch } from "./api";
import { summarize } from "./metrics";

/*
 * A pitcher by time through the order — the first look a lineup gets at him,
 * the second, the third — which is where a starter's fade shows up first:
 * the fastball loses a tick, the whiffs dry up, the contact gets louder.
 *
 * Velocity is his main fastball's alone. An all-pitch average would move
 * every time the mix did, and starters do change their mix the second time
 * through.
 */

export const FASTBALLS = ["FF", "SI", "FC"];

export interface TtoRow {
  /** 1, 2, 3, or 4 for the fourth time and beyond. */
  tto: number;
  pas: number;
  pitches: number;
  velo: number | null;
  whiffRate: number | null;
  xwoba: number | null;
}

/** The fastball he throws most, or null for a pitcher without one. */
export function mainFastball(pitches: Pitch[]): string | null {
  const n = new Map<string, number>();
  for (const p of pitches)
    if (p.pitch_type && FASTBALLS.includes(p.pitch_type))
      n.set(p.pitch_type, (n.get(p.pitch_type) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** xwOBA allowed: expected on contact, actual on walks and strikeouts. */
const xwobaOf = (pitches: Pitch[]) => {
  let num = 0;
  let den = 0;
  for (const p of pitches)
    if (p.woba_denom) {
      den += p.woba_denom;
      num += p.xwoba ?? p.woba_value ?? 0;
    }
  return den ? num / den : null;
};

export function timesThrough(pitches: Pitch[]): { fastball: string | null; rows: TtoRow[] } {
  const fastball = mainFastball(pitches);
  const rows = [1, 2, 3, 4].map((tto) => {
    const these = pitches.filter((p) => p.tto != null && Math.min(p.tto, 4) === tto);
    return {
      tto,
      pas: these.filter((p) => p.events).length,
      pitches: these.length,
      velo: fastball ? summarize(these.filter((p) => p.pitch_type === fastball)).avgVelo : null,
      whiffRate: summarize(these).whiffRate,
      xwoba: xwobaOf(these),
    };
  });
  return { fastball, rows: rows.filter((r) => r.pitches > 0) };
}
