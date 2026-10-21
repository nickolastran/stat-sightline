/*
 * ABS challenge leaderboards.
 *
 * MLB's Stats API says nothing about the automated ball-strike system, so
 * this reads Baseball Savant's own ABS page, which ships its table as a
 * `const absData = [...]` literal in the HTML — and the league's own line as
 * a `leagueData` one beside it, already narrowed to whatever the filters say.
 * Scraping those is the whole client: there is no JSON endpoint behind them.
 * Every row carries both sides of the ledger — its challenges as the
 * challenger, and the same fields suffixed `_against` for the challenges made
 * against it — so the AS CHALLENGED view is the same page, read the other way.
 *
 * Server-only, like lib/mlb. Cached for an hour — the figures move once a
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
export const ABS_MINS = [0, 1, 2, 5, 10, 20].map((n) => ({
  value: String(n),
  label: String(n),
}));

/** Which side of the challenge a row is read from. */
export const ABS_SIDES = [
  { value: "for", label: "AS CHALLENGER" },
  { value: "against", label: "AS CHALLENGED (OPP. POV)" },
];

/** Regular season, the postseason's four rounds, or both — Savant's game types. */
export const ABS_GAME_TYPES = [
  { value: "R", label: "REGULAR SEASON" },
  { value: "F|D|L|W", label: "POSTSEASON" },
  { value: "R|F|D|L|W", label: "ALL" },
];

export const ABS_LEVELS = [
  { value: "mlb", label: "MLB" },
  { value: "aaa", label: "AAA" },
];

/** How much the pitch could swing the game, in Savant's bands. */
export const ABS_LEVERAGE = [
  { value: "", label: "ALL" },
  { value: "vlow", label: "VERY LOW" },
  { value: "low", label: "LOW" },
  { value: "med", label: "MEDIUM" },
  { value: "high", label: "HIGH" },
];

/** Challenges the team had left when the pitch came. */
export const ABS_REMAINING = [
  { value: "", label: "ALL" },
  { value: "2", label: "2" },
  { value: "1", label: "1" },
];

/** Whether the pitch was over the plate — the call, not the challenge. */
export const ABS_IN_OUT = [
  { value: "", label: "ALL" },
  { value: "in", label: "IN ZONE" },
  { value: "out", label: "OUT OF ZONE" },
];

/**
 * How much the challenge had to be worth to break even — Savant's confidence
 * requirement. A two-strike take needs far more certainty than a 1-0 one.
 */
export const ABS_CONF = [
  { value: "", label: "ALL" },
  { value: "low", label: "LOW" },
  { value: "med", label: "50/50" },
  { value: "high", label: "HIGH" },
  { value: "vhigh", label: "VERY HIGH" },
];

/** Pitch types, in Savant's own groups — the pop-out's shape. */
export const ABS_PITCH_GROUPS = [
  { label: "FASTBALL", options: [["FF", "4-SEAM"], ["SI", "SINKER"], ["FC", "CUTTER"]] },
  { label: "OFFSPEED", options: [["CH", "CHANGE"], ["FS", "SPLIT"], ["FO", "FORKBALL"], ["SC", "SCREWBALL"]] },
  { label: "BREAKING", options: [["CU", "CURVE"], ["SL", "SLIDER"], ["ST", "SWEEPER"], ["SV", "SLURVE"]] },
  { label: "OTHER", options: [["KN", "KNUCKLE"]] },
].map((g) => ({
  label: g.label,
  options: g.options.map(([value, label]) => ({ value, label })),
}));

/*
 * The shadow zone — the ring of eight cells straddling the edge of the strike
 * zone, numbered clockwise from the top-left corner. Only these are offered:
 * the heart (1-9) and the waste pitches (31-39) are calls nobody challenges,
 * and 15 is the middle of the ring, which is the zone itself.
 */
export const ABS_ZONES = [11, 12, 13, 14, 16, 17, 18, 19].map((z) => ({
  value: String(z),
  label: `ZONE ${z}`,
}));

/** Top / sides / bottom of that ring, as the pop-out's one-click groups. */
export const ABS_ZONE_QUICK = [
  { label: "TOP", values: ["11", "12", "13"] },
  { label: "SIDES", values: ["14", "16"] },
  { label: "BOTTOM", values: ["17", "18", "19"] },
];

/** Savant's own diagram of that numbering, shown inside the pop-out. */
export const ABS_ZONE_IMAGE =
  "https://baseballsavant.mlb.com/site-core/images/attack-zone.png";

/**
 * Splitting a board into several rows per club or player. Each key comes back
 * as a field of that name on every row, which is what the SPLIT column reads.
 */
export const ABS_GROUP_BY = [
  { value: "year", label: "SEASON" },
  { value: "api_game_date_month_text", label: "MONTH" },
  { value: "game_type", label: "GAME TYPE" },
  { value: "home_away", label: "HOME / AWAY" },
  { value: "is_strike_calc", label: "IN / OUT OF ZONE" },
  { value: "api_pitch_type_group03", label: "PITCH TYPE" },
  { value: "gameday3_pitchzone_cd", label: "ATTACK ZONE" },
  { value: "abschallenge_breakeven_code", label: "CHAL. CONF. REQ." },
  { value: "bat_position_code", label: "BATTER DEF. POSITION" },
  { value: "lineup_cd", label: "BATTER LINEUP SLOT" },
];

/** Everything the board is filtered by, as the page resolves it once. */
export interface AbsQuery {
  type: AbsType;
  /** "for" reads each row as the challenger; "against", as the challenged. */
  side: string;
  gameType: string;
  level: string;
  leverage: string;
  /** Challenges left: "", "2", "1". */
  remaining: string;
  min: string;
  minOpp: string;
  /** Whether the pitch was in the zone: "", "in", "out". */
  inOut: string;
  /** Confidence the challenge needed to break even: "", "low"…"vhigh". */
  conf: string;
  /** MLB team ids doing the challenging, and being challenged. */
  org: string[];
  opp: string[];
  pitch: string[];
  zone: string[];
  group: string[];
}

/** What the query string is allowed to say, per parameter. */
const inList = (raw: string | undefined, options: { value: string }[], fallback: string) =>
  options.some((o) => o.value === raw) ? raw! : fallback;

/** A pipe-joined list, keeping only values the board actually serves. */
const inSet = (raw: string | undefined, allowed: (v: string) => boolean): string[] =>
  raw ? raw.split("|").filter(allowed) : [];

const isTeamId = (v: string) => /^\d{3}$/.test(v);

/** The whole filter set out of the query string, junk dropped. */
export function pickAbsQuery(sp: {
  type?: string;
  as?: string;
  gt?: string;
  level?: string;
  leverage?: string;
  left?: string;
  min?: string;
  minopp?: string;
  inout?: string;
  conf?: string;
  org?: string;
  opp?: string;
  pitch?: string;
  zone?: string;
  /* ?split=, not ?group= — the player board already owns that parameter. */
  split?: string;
}): AbsQuery {
  const pitchTypes = new Set(
    ABS_PITCH_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
  );
  const zones = new Set(ABS_ZONES.map((z) => z.value));
  const groups = new Set(ABS_GROUP_BY.map((g) => g.value));
  return {
    type: inList(sp.type, ABS_TYPES as unknown as { value: string }[], "batting-team") as AbsType,
    side: inList(sp.as, ABS_SIDES, "for"),
    gameType: inList(sp.gt, ABS_GAME_TYPES, "R"),
    level: inList(sp.level, ABS_LEVELS, "mlb"),
    leverage: inList(sp.leverage, ABS_LEVERAGE, ""),
    remaining: inList(sp.left, ABS_REMAINING, ""),
    min: inList(sp.min, ABS_MINS, "1"),
    minOpp: inList(sp.minopp, ABS_MINS, "0"),
    inOut: inList(sp.inout, ABS_IN_OUT, ""),
    conf: inList(sp.conf, ABS_CONF, ""),
    org: inSet(sp.org, isTeamId),
    opp: inSet(sp.opp, isTeamId),
    pitch: inSet(sp.pitch, (v) => pitchTypes.has(v)),
    zone: inSet(sp.zone, (v) => zones.has(v)),
    group: inSet(sp.split, (v) => groups.has(v)),
  };
}

/** One row of the board — a club or a player, and how its challenges went. */
export interface AbsRow {
  /** Unique down the board: an id alone, or an id and its split. */
  key: string;
  /** MLBAM id: a team id on the team boards, a player id on the others. */
  id: number;
  name: string;
  teamId: number | null;
  teamAbbr: string | null;
  /** What this row is a slice of, when GROUP BY is on — else null. */
  split: string | null;
  /** Run value of the challenges above what an average challenger gets out
   *  of the same calls: what the wins gained over expected, plus what the
   *  losses cost under it. */
  raa: number;
  runsGained: number;
  runsCost: number;
  xRunsGained: number;
  xRunsCost: number;
  gainVsExp: number;
  costVsExp: number;
  /** Run value of every call that went against this row with a challenge in
   *  hand — what was there to take, the share taken, and what was left. */
  possRuns: number;
  pctRunsTaken: number | null;
  runsNotTaken: number;
  chal: number;
  won: number;
  lost: number;
  /** Share of challenges overturned, 0-1. */
  wonPct: number | null;
  xChal: number;
  xWon: number;
  xLost: number;
  xWonPct: number | null;
  wonVsExp: number;
  lostVsExp: number;
  /** Overturns there were to win, the share won, and what was left. */
  possOvr: number;
  pctOvrTaken: number | null;
  ovrNotTaken: number;
  /** Strikeouts and walks an overturn turned around. */
  kFlip: number;
  bbFlip: number;
}

/** The board, and the league's own line on the same slice to read it against. */
export interface AbsBoard {
  rows: AbsRow[];
  league: AbsRow | null;
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const rate = (v: unknown): number | null => (typeof v === "number" ? v : null);

function toRow(r: Record<string, unknown>, group: string[], side: string): AbsRow {
  const split = group
    .map((k) => r[k])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" · ");
  /* The challenged side is every challenger field again, suffixed. */
  const f = (k: string) => r[side === "against" ? `${k}_against` : k];
  return {
    key: String(r.uniqueId ?? r.id ?? r.player_name),
    id: num(r.id),
    name: String(r.player_name ?? ""),
    teamId: typeof r.player_team === "number" ? r.player_team : null,
    teamAbbr: typeof r.team_abbr === "string" ? r.team_abbr : null,
    split: split || null,
    raa: num(f("runs_above_average")),
    runsGained: num(f("n_chal_runs_gained")),
    runsCost: num(f("runs_cost")),
    xRunsGained: num(f("exp_chal_runs_gained")),
    xRunsCost: num(f("exp_runs_cost")),
    gainVsExp: num(f("net_chal_gained_runs")),
    costVsExp: num(f("cost_vs_exp")),
    possRuns: num(f("runs_available")),
    pctRunsTaken: rate(f("runs_percent")),
    runsNotTaken: num(f("runs_not_taken")),
    chal: num(f("n_challenges")),
    won: num(f("n_overturns")),
    lost: num(f("n_fails")),
    wonPct: rate(f("rate_overturns")),
    xChal: num(f("exp_chal")),
    xWon: num(f("exp_chal_gained")),
    xLost: num(f("exp_chal_lost")),
    xWonPct: rate(f("exp_rate_overturns")),
    wonVsExp: num(f("net_chal_gained")),
    lostVsExp: num(f("net_chal_lost")),
    possOvr: num(f("ot_available")),
    pctOvrTaken: rate(f("ot_percent")),
    ovrNotTaken: num(f("ot_not_taken")),
    kFlip: num(f("n_strikeouts")),
    bbFlip: num(f("n_walks")),
  };
}

const literal = (html: string, name: string): Record<string, unknown>[] | null => {
  const match = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(html);
  return match ? (JSON.parse(match[1]) as Record<string, unknown>[]) : null;
};

/**
 * The board out of one Savant page.
 *
 * Throws if the page stops carrying the table, so a silent layout change
 * surfaces as the section's "unavailable" notice rather than an empty table
 * that looks like a season nobody challenged in. A season before ABS is a
 * real empty array. The league line is optional: losing it costs one row at
 * the top of a board that is otherwise fine.
 */
export function parseAbs(html: string, group: string[] = [], side = "for"): AbsBoard {
  const raw = literal(html, "absData");
  if (!raw) throw new Error("Savant ABS: no absData in page");
  /* GROUP BY splits the league line the same way it splits the board, so
     there is no single league row left to pin — one slice of it labelled
     "LEAGUE" would read as the whole season. Better no baseline than a
     wrong one; ungrouping brings it back. */
  const league = group.length ? undefined : literal(html, "leagueData")?.[0];
  return {
    rows: raw.map((r) => toRow(r, group, side)),
    league: league ? { ...toRow(league, [], side), name: "LEAGUE" } : null,
  };
}

/** Savant takes its multi-value filters pipe-joined, and errors on repeats. */
const joined = (values: string[]) => values.join("|");

/** One ABS board, fetched. */
export async function getAbsLeaders(
  season: number,
  q: AbsQuery,
): Promise<AbsBoard> {
  const params = new URLSearchParams({
    challengeType: q.type,
    year: String(season),
    minChal: q.min,
    minOppChal: q.minOpp,
    gameType: q.gameType,
    level: q.level,
  });
  /* Every one of these is "no filter" when absent, and Savant rejects some of
     them when present and empty — so an unset control sends nothing at all. */
  const optional: Record<string, string> = {
    ballStrike: q.inOut,
    leverage: q.leverage,
    chalRemaining: q.remaining,
    breakeven: q.conf,
    chalOrg: joined(q.org),
    oppOrg: joined(q.opp),
    pitchType: joined(q.pitch),
    shadowZones: joined(q.zone),
    groupBy: joined(q.group),
  };
  for (const [k, v] of Object.entries(optional)) if (v) params.set(k, v);

  const res = await fetch(`${ABS_URL}?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Savant ABS ${res.status}: ${q.type}`);
  return parseAbs(await res.text(), q.group, q.side);
}
