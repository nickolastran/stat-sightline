/*
 * Rolling form: a player's xwOBA or K% over a trailing window, through a
 * season, off the same Statcast pitches the Statcast tab already loads.
 *
 * A batter's window is games. A pitcher's is batters faced: a starter makes
 * ~32 starts, so a 30- or 50-game window is his whole season or more, and a
 * count of starts would leave relievers out entirely. Both are the same
 * arithmetic over a different unit — a game, or one plate appearance.
 *
 * Sums, not averages of averages: a window's rate is its totals divided, so a
 * two-PA pinch-hit game weighs two PAs, not a full game.
 */
import type { Pitch } from "./api";

export type RollMetric = "xwoba" | "k";
export type RollRole = "pitcher" | "batter";

/** Each role's window sizes, its default, and the unit they count. */
export const WINDOWS: Record<RollRole, { sizes: number[]; initial: number; unit: string }> = {
  batter: { sizes: [15, 30, 50], initial: 30, unit: "G" },
  pitcher: { sizes: [50, 100, 250], initial: 100, unit: "BF" },
};

/** One unit's totals — a game, or a single plate appearance. */
interface GameLine {
  date: string;
  pa: number;
  k: number;
  xNum: number;
  xDen: number;
}

export interface RollPoint {
  /** Date of the last unit in the window. */
  date: string;
  /** 1-based index of the last unit in the window. */
  unit: number;
  value: number;
  pa: number;
}

/* Statcast hangs a running play that ends an inning (a caught stealing, a
   pickoff) on the pitch as its `events`, though the batter had no PA. */
const NOT_A_PA = /^(caught_stealing|pickoff|stolen_base|other_advance|wild_pitch|passed_ball)/;
const STRIKEOUT = /^strikeout/;

/**
 * The season in order, one line per game (a batter) or per plate appearance
 * (a pitcher), each reduced to the counts a rate needs.
 */
export function gameLines(pitches: Pitch[], role: RollRole = "batter"): GameLine[] {
  const games = new Map<string, GameLine & { pk: number; ab: number }>();
  for (const p of pitches) {
    if (!p.events || NOT_A_PA.test(p.events) || !p.game_date) continue;
    const game = String(p.game_pk ?? p.game_date);
    const key = role === "pitcher" ? `${game}-${p.at_bat_number}` : game;
    const g =
      games.get(key) ??
      games
        .set(key, {
          date: p.game_date,
          pk: p.game_pk ?? 0,
          ab: role === "pitcher" ? (p.at_bat_number ?? 0) : 0,
          pa: 0, k: 0, xNum: 0, xDen: 0,
        })
        .get(key)!;
    g.pa += 1;
    if (STRIKEOUT.test(p.events)) g.k += 1;
    /* xwOBA: Statcast's estimate on contact, the actual wOBA value on a walk,
       HBP or strikeout, over the wOBA denominator (no IBB, no sac bunt). */
    if (p.woba_denom) {
      g.xDen += p.woba_denom;
      g.xNum += p.xwoba ?? p.woba_value ?? 0;
    }
  }
  return [...games.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.pk - b.pk || a.ab - b.ab,
  );
}

const rate = (m: RollMetric, s: Omit<GameLine, "date">) =>
  m === "k" ? (s.pa ? s.k / s.pa : null) : s.xDen ? s.xNum / s.xDen : null;

/** The whole season's figure — the line the rolling one is read against. */
export const seasonRate = (games: GameLine[], m: RollMetric): number | null =>
  rate(
    m,
    games.reduce(
      (s, g) => ({ pa: s.pa + g.pa, k: s.k + g.k, xNum: s.xNum + g.xNum, xDen: s.xDen + g.xDen }),
      { pa: 0, k: 0, xNum: 0, xDen: 0 },
    ),
  );

/** One point per unit from the Nth on, each over the N units ending there. */
export function rolling(games: GameLine[], n: number, m: RollMetric): RollPoint[] {
  const out: RollPoint[] = [];
  const s = { pa: 0, k: 0, xNum: 0, xDen: 0 };
  games.forEach((g, i) => {
    s.pa += g.pa; s.k += g.k; s.xNum += g.xNum; s.xDen += g.xDen;
    const old = games[i - n];
    if (old) {
      s.pa -= old.pa; s.k -= old.k; s.xNum -= old.xNum; s.xDen -= old.xDen;
    }
    const v = i >= n - 1 ? rate(m, s) : null;
    if (v !== null) out.push({ date: g.date, unit: i + 1, value: v, pa: s.pa });
  });
  return out;
}

/** xwOBA reads as Savant prints it, ".342"; K% as a percentage. */
export const rollText = (m: RollMetric, v: number) =>
  m === "k" ? `${(v * 100).toFixed(1)}%` : v.toFixed(3).replace(/^0/, "");
