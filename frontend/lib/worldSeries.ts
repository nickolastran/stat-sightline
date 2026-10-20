import { HOME_FIELD_ODDS } from "./mlb/game";

/*
 * The World Series, called a game at a time. Each game starts from the two
 * clubs' run-based strength — Pythagorean records regressed toward .500,
 * log5, the home club's edge — then swings on the starting pitchers: how each lineup projects
 * against the other side's starter by pitch mix (lib/matchupEdge). The seven
 * games' odds are then played out exactly, so the series odds and the
 * length of it come from the same numbers.
 *
 * Starters are MLB's announced probables where there are any, and otherwise
 * projected: each club's most trusted arms, in turn, each on full rest.
 *
 * A lineup's swing is read against the rotation it faces over the series
 * (`centered`), not against the league: the run differential already holds
 * how good a club's starters are, so the swing says only which of them goes.
 *
 * ponytail: the bullpen past the starter is the club's average, and the
 * active roster's hitters stand in for the lineup, weighted by PA. Pull the
 * posted lineups once MLB has them if a game's call needs to be sharper.
 */

/** Pythagorean win share off runs scored and allowed (exponent 1.83). */
export const pythag = (rs: number, ra: number): number =>
  rs + ra === 0 ? 0.5 : rs ** 1.83 / (rs ** 1.83 + ra ** 1.83);

/** Games of .500 folded into a season's record to read it as true talent —
 *  Tango's figure; a 162-game record is about 30% luck. */
export const REGRESS_GAMES = 69;

/** A club's true-talent win share: its Pythagorean record over `games`,
 *  pulled toward .500. */
export const strengthOf = (rs: number, ra: number, games: number): number =>
  (pythag(rs, ra) * games + 0.5 * REGRESS_GAMES) / (games + REGRESS_GAMES);

/** The home club's chance in one game, before the starters, by log5 off the
 *  two clubs' strengths and tilted for home field. */
export function baseOdds(home: number, away: number): number {
  const denom = home + away - 2 * home * away;
  const neutral = denom === 0 ? 0.5 : (home - home * away) / denom;
  const odds = (neutral / (1 - neutral)) * HOME_FIELD_ODDS;
  return odds / (1 + odds);
}

/** PAs a starter sees in a game, of about 38. */
export const STARTER_PA = 22;

/**
 * A game's swing in win chance for a lineup this far over the league's xwOBA
 * against tonight's starter. wOBA runs about 1.2 to the run per PA over the
 * league, the starter faces STARTER_PA of the lineup, and ten runs are a win.
 */
export const starterSwing = (xwobaOver: number): number =>
  ((xwobaOver / 1.2) * STARTER_PA) / 10;

/** Each figure less the mean of those that aren't null; a null reads 0 —
 *  a lineup against each starter, over the rotation it faces. */
export function centered(xs: (number | null)[]): number[] {
  const known = xs.filter((x): x is number => x !== null);
  const mean = known.length ? known.reduce((n, x) => n + x, 0) / known.length : 0;
  return xs.map((x) => (x === null ? 0 : x - mean));
}

/** The home club's chance, the starters' swings applied, kept off 0 and 1. */
export const gameOdds = (base: number, homeOver: number, awayOver: number): number =>
  Math.min(0.95, Math.max(0.05, base + starterSwing(homeOver) - starterSwing(awayOver)));

export interface Start {
  id: number;
  name: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface Starter {
  id: number;
  name: string;
  /** MLB's probable, not our projection. */
  announced: boolean;
}

/** Days between starts that make full rest: four off, the fifth on. */
export const FULL_REST = 5;

const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * One club's starter for each of `dates`. Its rotation is the four arms that
 * started its last postseason games, most trusted first — the most starts
 * this October, then the one who started earliest, the Game 1 arm. Each game
 * goes to the most trusted on full rest, else to the most rested; an
 * announced probable (`announced[i]`) takes the game as named.
 */
export function projectRotation(
  starts: Start[],
  dates: string[],
  announced: ({ id: number; name: string } | null)[] = [],
): (Starter | null)[] {
  const pool = new Map<number, { id: number; name: string; n: number; first: string; last: string }>();
  for (const s of [...starts].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = pool.get(s.id) ?? { id: s.id, name: s.name, n: 0, first: s.date, last: s.date };
    p.n += 1;
    p.last = s.date;
    pool.set(s.id, p);
  }
  const arms = [...pool.values()]
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 4)
    .sort((a, b) => b.n - a.n || a.first.localeCompare(b.first));

  return dates.map((date, i) => {
    const named = announced[i];
    const pick =
      named ??
      arms.find((p) => days(p.last, date) >= FULL_REST) ??
      [...arms].sort((a, b) => a.last.localeCompare(b.last))[0];
    if (!pick) return null;
    const p = pool.get(pick.id);
    if (p) p.last = date;
    return { id: pick.id, name: pick.name, announced: !!named };
  });
}

/**
 * A best-of-`ps.length` series played out exactly, from one club's chance in
 * each game (1 or 0 for a game already final). `aIn[k]` is the chance it
 * wins the series in exactly k games, `bIn[k]` that it loses in k.
 */
export function seriesForecast(ps: number[]): { odds: number; aIn: number[]; bIn: number[] } {
  const need = Math.ceil(ps.length / 2);
  const aIn = Array<number>(ps.length + 1).fill(0);
  const bIn = Array<number>(ps.length + 1).fill(0);
  let states = new Map<string, [number, number, number]>([["0-0", [0, 0, 1]]]);
  ps.forEach((p, i) => {
    const next = new Map<string, [number, number, number]>();
    for (const [a, b, q] of states.values())
      for (const [na, nb, nq] of [
        [a + 1, b, q * p],
        [a, b + 1, q * (1 - p)],
      ]) {
        if (na === need) aIn[i + 1] += nq;
        else if (nb === need) bIn[i + 1] += nq;
        else {
          const s = next.get(`${na}-${nb}`) ?? [na, nb, 0];
          s[2] += nq;
          next.set(`${na}-${nb}`, s);
        }
      }
    states = next;
  });
  return { odds: aIn.reduce((n, q) => n + q, 0), aIn, bIn };
}
