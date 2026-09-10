/*
 * ABS challenge leaderboards.
 *
 * MLB's Stats API says nothing about the automated ball-strike system, so
 * this reads Baseball Savant's own ABS page, which ships its table as a
 * `const absData = [...]` literal in the HTML. Scraping that is the whole
 * client: there is no JSON endpoint behind it, and the CSV export drops the
 * challenge-rate and "reasonable take" columns the board is built around.
 *
 * Server-only, like lib/mlb.ts. Cached for an hour — the figures move once a
 * day at most, and the batter page is well over a megabyte of HTML.
 */
const ABS_URL = "https://baseballsavant.mlb.com/leaderboard/abs-challenges";

/** MLB's first season with ABS challenges in regular-season games. */
export const ABS_FIRST_SEASON = 2026;

/** Savant's own five boards: who is doing the challenging. */
export const ABS_TYPES = [
  { value: "batting-team", label: "BATTING TEAMS" },
  { value: "catching-team", label: "FIELDING TEAMS" },
  { value: "batter", label: "BATTERS" },
  { value: "catcher", label: "CATCHERS" },
  { value: "pitcher", label: "PITCHERS" },
] as const;

export type AbsType = (typeof ABS_TYPES)[number]["value"];

export const isTeamBoard = (type: AbsType) => type.endsWith("-team");

/** Minimum challenges to make the board — pitchers challenge a handful a
 *  year, so without a floor the leaders are all 1-for-1. */
export const ABS_MINS = [0, 1, 5, 10, 20, 50].map((n) => ({
  value: String(n),
  label: String(n),
}));

export const pickAbsType = (raw: string | undefined): AbsType =>
  (ABS_TYPES.find((t) => t.value === raw)?.value ?? "batting-team") as AbsType;

export const pickAbsMin = (raw: string | undefined): string =>
  ABS_MINS.some((m) => m.value === raw) ? raw! : "1";

/** One row of the board — a club or a player, and how its challenges went. */
export interface AbsRow {
  /** MLBAM id: a team id on the team boards, a player id on the others. */
  id: number;
  name: string;
  teamId: number | null;
  teamAbbr: string | null;
  chal: number;
  won: number;
  lost: number;
  /** Share of challenges overturned, 0-1. */
  wonPct: number | null;
  /** Overturns above what an average challenger gets on the same calls. */
  netOvr: number;
  /** Runs gained above expected on those same challenges. */
  netRuns: number;
  /** Strikeouts gained and walks erased by an overturn. */
  kFlip: number;
  bbFlip: number;
  /** Challenges per challengeable take, actual / expected / difference. */
  rate: number | null;
  xRate: number | null;
  rateDiff: number | null;
  /** Takes worth challenging, and how many were actually challenged. */
  rsnOpp: number;
  rsnChal: number;
  pctRsn: number | null;
  pctTaken: number | null;
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const rate = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * The board out of one Savant page.
 *
 * Throws if the page stops carrying the literal, so a silent layout change
 * surfaces as the section's "unavailable" notice rather than an empty table
 * that looks like a season nobody challenged in. A season before ABS is a
 * real empty array.
 */
export function parseAbs(html: string): AbsRow[] {
  const match = /const absData = (\[[\s\S]*?\]);/.exec(html);
  if (!match) throw new Error("Savant ABS: no absData in page");

  const raw = JSON.parse(match[1]) as Record<string, unknown>[];
  return raw.map((r) => ({
    id: num(r.id),
    name: String(r.player_name ?? ""),
    teamId: typeof r.player_team === "number" ? r.player_team : null,
    teamAbbr: typeof r.team_abbr === "string" ? r.team_abbr : null,
    chal: num(r.n_challenges),
    won: num(r.n_overturns),
    lost: num(r.n_fails),
    wonPct: rate(r.rate_overturns),
    netOvr: num(r.net_net_chal),
    netRuns: num(r.net_net_runs),
    kFlip: num(r.n_strikeouts),
    bbFlip: num(r.n_walks),
    rate: rate(r.rate_challenges),
    xRate: rate(r.exp_rate_challenges),
    rateDiff: rate(r.exp_rate_challenges_diff),
    rsnOpp: num(r.n_chal_reasonable_opps),
    rsnChal: num(r.n_chal_reasonable),
    pctRsn: rate(r.rate_chal_reasonable),
    pctTaken: rate(r.rate_reasonable_opp_taken),
  }));
}

/** One ABS board, fetched. */
export async function getAbsLeaders(
  season: number,
  type: AbsType,
  minChal: string,
): Promise<AbsRow[]> {
  const res = await fetch(
    `${ABS_URL}?challengeType=${type}&year=${season}&minChal=${minChal}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) throw new Error(`Savant ABS ${res.status}: ${type}`);
  return parseAbs(await res.text());
}
