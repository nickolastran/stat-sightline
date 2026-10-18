import type { Pitch } from "./api";
import { savantCsv } from "./advanced";

/*
 * Bat tracking: how fast a hitter swings, how long the swing is, and how
 * often he squares the ball up, against the league.
 *
 * The rates come off Savant's bat-tracking board as Savant figures them — its
 * squared-up and blast calls need the bat's speed at the sweet spot and the
 * pitch's at the plate, neither of which the pitch feed carries. The board
 * has every hitter with a swing, so the league line is the same board
 * weighted by swings. The distributions come off the hitter's own swings.
 */

/** Bat tracking begins with the 2024 season. */
export const BAT_TRACKING_FIRST_SEASON = 2024;

export interface BatLine {
  swings: number;
  batSpeed: number;
  swingLength: number;
  /** Shares, 0-1. */
  squaredPerSwing: number;
  squaredPerContact: number;
  blastPerSwing: number;
  /** Swings of 75+ mph. */
  hardSwingRate: number;
}

const KEYS: Record<Exclude<keyof BatLine, "swings">, string> = {
  batSpeed: "avg_bat_speed",
  swingLength: "swing_length",
  squaredPerSwing: "squared_up_per_swing",
  squaredPerContact: "squared_up_per_bat_contact",
  blastPerSwing: "blast_per_swing",
  hardSwingRate: "hard_swing_rate",
};

/** The hitter's season line and the league's, or null off the board. */
export async function getBatTracking(
  id: number,
  season: number,
): Promise<{ player: BatLine; league: BatLine } | null> {
  const board = await savantCsv("bat-tracking", {
    type: "batter",
    gameType: "Regular",
    dateStart: `${season}-01-01`,
    dateEnd: `${season}-12-31`,
    minSwings: "1",
    minGroupSwings: "1",
  });
  return batLines(board, id);
}

/** Split out so the arithmetic can be checked without a fetch. */
export function batLines(board: Record<string, string>[], id: number) {
  const line = (r: Record<string, string>): BatLine => ({
    swings: Number(r.swings_competitive) || 0,
    ...(Object.fromEntries(
      Object.entries(KEYS).map(([k, col]) => [k, Number(r[col]) || 0]),
    ) as Omit<BatLine, "swings">),
  });
  const rows = board.map((r) => ({ id: Number(r.id), line: line(r) }));
  const mine = rows.find((r) => r.id === id);
  if (!mine) return null;

  /* Swing-weighted: a hitter's rate is per swing, so the league's is too.
     ponytail: per-contact rates are weighted by swings, not contacts — off
     by a hair for the squared-up-per-contact line. */
  const total = rows.reduce((n, r) => n + r.line.swings, 0) || 1;
  const league = {
    swings: total,
    ...(Object.fromEntries(
      Object.keys(KEYS).map((k) => [
        k,
        rows.reduce(
          (n, r) => n + r.line[k as keyof BatLine] * r.line.swings,
          0,
        ) / total,
      ]),
    ) as Omit<BatLine, "swings">),
  };
  return { player: mine.line, league };
}

/**
 * Savant's competitive swings: the hitter's slowest tenth dropped — checked
 * swings, bunts, defensive pokes — unless the ball came off at 90+ mph.
 * Matches the board's swing count and average bat speed to a swing or two.
 */
export function competitiveSwings(pitches: Pitch[]): Pitch[] {
  const swings = pitches.filter((p) => p.bat_speed != null);
  if (swings.length === 0) return [];
  const speeds = swings.map((p) => p.bat_speed!).sort((a, b) => a - b);
  const floor = speeds[Math.floor(speeds.length * 0.1)];
  return swings.filter(
    (p) => p.bat_speed! >= floor || (p.launch_speed ?? 0) >= 90,
  );
}

/** Counts in `bins` bins of `step` from `lo`; outliers land in the end bins. */
export function histogram(values: number[], lo: number, step: number, bins: number) {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values)
    counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / step)))] += 1;
  return counts;
}
