/* A player's career: column sets, advanced and summed lines, league-leader marks, sabermetrics, season-by-season, and the awards and ballot finishes on it. */
import awardVotes from "@/data/award-votes.json";
import {
  mlb,
  push,
} from "./core";
import {
  ordinal,
  type TeamStatCol,
  teamStatNum,
  type TeamStatValue,
} from "./stats";
import {
  inningsOf,
  outsOf,
  PLAYER_FIELDING_COLS,
  playerCols,
  type StatGroup,
} from "./players";


/* ── Player detail: career, splits, game log, bio ───────────────────── */

/**
 * Which stat tables a player's page offers. A hitter gets batting and
 * fielding, a pitcher pitching and fielding, and a two-way player all three —
 * decided from what he has actually done rather than from his listed position
 * alone, since a position is a label and the career line is the evidence. The
 * thresholds are there so a mop-up inning by a losing club's shortstop, or a
 * pitcher's handful of pre-DH at-bats, doesn't turn him into a two-way player.
 */
export async function getPlayerGroups(
  id: number,
  pos: string,
): Promise<StatGroup[]> {
  const data = await mlb(
    `/people/${id}/stats?stats=career&group=hitting,pitching,fielding&sportId=1`,
    86400,
  ).catch(() => null);

  const vol = new Map<StatGroup, number>();
  for (const s of (data?.stats ?? []) as any[]) {
    const g = s.group?.displayName as StatGroup;
    const stat = s.splits?.[0]?.stat;
    if (!stat) continue;
    vol.set(
      g,
      g === "hitting"
        ? (teamStatNum(stat.plateAppearances) ?? 0)
        : g === "pitching"
          ? outsOf(stat.inningsPitched)
          : (teamStatNum(stat.games) ?? 0),
    );
  }
  const pa = vol.get("hitting") ?? 0;
  const outs = vol.get("pitching") ?? 0;

  /* MLB tags a two-way player's position outright, which is the only signal
     that doesn't misread a pitcher's pre-DH at-bats. The volume test behind
     it is for the ones it never tagged — Ruth's era had no such position —
     and is deliberately far above what a pitcher accumulates at the plate
     over a long career: Cole finished with 286 plate appearances. */
  const twoWay = pos === "TWP" || (pa >= 1000 && outs >= 900);
  const wanted: StatGroup[] = twoWay
    ? ["hitting", "pitching", "fielding"]
    : pos === "P" || (outs > 0 && pa < 1000)
      ? ["pitching", "fielding"]
      : ["hitting", "fielding"];

  /* Never offer a table with nothing in it — a rookie called up as a fielder
     has no career line yet, and an empty tab is worse than a missing one. */
  const shown = wanted.filter((g) => (vol.get(g) ?? 0) > 0);
  return shown.length > 0 ? shown : [wanted[0]];
}

/** A player's stat group as a heading — the labels the group control uses. */
export const STAT_GROUP_LABEL: Record<StatGroup, string> = {
  hitting: "BATTING",
  pitching: "PITCHING",
  fielding: "FIELDING",
};

export const groupOptions = (groups: StatGroup[]) =>
  groups.map((g) => ({ value: g, label: STAT_GROUP_LABEL[g] }));

/** Anything but one of the player's own groups reads as their first. */
export const pickPlayerGroup = (
  raw: string | undefined,
  groups: StatGroup[],
): StatGroup =>
  groups.includes(raw as StatGroup) ? (raw as StatGroup) : groups[0];

/* ── Career column sets ─────────────────────────────────────────────── */

/*
 * The career table carries a fuller line than the roster tables do: it is the
 * one place a whole career is read at once, so the figures that only mean
 * something over years — total bases, double plays grounded into, the
 * intentional walks a feared hitter draws — earn their column here and
 * nowhere else. Order follows how a career line is conventionally printed:
 * playing time, the counting stats, then the rates they produce.
 *
 * The sabermetric figures come from MLB's own `sabermetrics` feed, which
 * serves FanGraphs' computations — so WAR here is fWAR, not Baseball-
 * Reference's. OPS+ has no feed at all and is worked out here against the
 * league's own line; see leagueRates.
 */
export const CAREER_HITTING_COLS: TeamStatCol[] = [
  {
    key: "war",
    label: "WAR",
    title: "Wins above replacement (FanGraphs, via MLB)",
  },
  { key: "gamesPlayed", label: "G", title: "Games played" },
  { key: "plateAppearances", label: "PA", title: "Plate appearances" },
  { key: "atBats", label: "AB", title: "At-bats" },
  { key: "runs", label: "R", title: "Runs scored" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "doubles", label: "2B", title: "Doubles" },
  { key: "triples", label: "3B", title: "Triples" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "stolenBases", label: "SB", title: "Stolen bases" },
  { key: "caughtStealing", label: "CS", title: "Caught stealing" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "SO", title: "Strikeouts" },
  { key: "avg", label: "BA", title: "Batting average — hits per at-bat" },
  { key: "obp", label: "OBP", title: "On-base percentage" },
  { key: "slg", label: "SLG", title: "Slugging percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
  {
    key: "opsPlus",
    label: "OPS+",
    title:
      "OPS against his league, adjusted for the parks he played in — 100 is average",
  },
  { key: "totalBases", label: "TB", title: "Total bases" },
  {
    key: "groundIntoDoublePlay",
    label: "GIDP",
    title: "Grounded into double plays",
  },
  { key: "hitByPitch", label: "HBP", title: "Hit by pitch" },
  { key: "sacBunts", label: "SH", title: "Sacrifice hits (bunts)" },
  { key: "sacFlies", label: "SF", title: "Sacrifice flies" },
  { key: "intentionalWalks", label: "IBB", title: "Intentional walks" },
];

export const CAREER_PITCHING_COLS: TeamStatCol[] = [
  {
    key: "war",
    label: "WAR",
    title: "Wins above replacement (FanGraphs, via MLB)",
  },
  { key: "wins", label: "W", title: "Wins" },
  { key: "losses", label: "L", title: "Losses" },
  { key: "winPercentage", label: "W-L%", title: "Winning percentage" },
  { key: "era", label: "ERA", title: "Earned run average" },
  { key: "gamesPlayed", label: "G", title: "Games pitched" },
  { key: "gamesStarted", label: "GS", title: "Games started" },
  { key: "gamesFinished", label: "GF", title: "Games finished" },
  { key: "completeGames", label: "CG", title: "Complete games" },
  { key: "shutouts", label: "SHO", title: "Shutouts" },
  { key: "saves", label: "SV", title: "Saves" },
  { key: "inningsPitched", label: "IP", title: "Innings pitched" },
  { key: "hits", label: "H", title: "Hits allowed" },
  { key: "runs", label: "R", title: "Runs allowed" },
  { key: "earnedRuns", label: "ER", title: "Earned runs allowed" },
  { key: "homeRuns", label: "HR", title: "Home runs allowed" },
  { key: "baseOnBalls", label: "BB", title: "Walks issued" },
  { key: "intentionalWalks", label: "IBB", title: "Intentional walks issued" },
  { key: "strikeOuts", label: "SO", title: "Strikeouts recorded" },
  { key: "hitBatsmen", label: "HBP", title: "Batters hit by a pitch" },
  { key: "balks", label: "BK", title: "Balks" },
  { key: "wildPitches", label: "WP", title: "Wild pitches" },
  { key: "battersFaced", label: "BF", title: "Batters faced" },
  { key: "whip", label: "WHIP", title: "Walks and hits per inning pitched" },
  {
    key: "fip",
    label: "FIP",
    title: "Fielding independent pitching (FanGraphs, via MLB)",
  },
  {
    key: "eraPlus",
    label: "ERA+",
    title:
      "ERA against his league, adjusted for the parks he pitched in — 100 is average",
  },
  { key: "hitsPer9Inn", label: "H9", title: "Hits allowed per nine innings" },
  {
    key: "homeRunsPer9",
    label: "HR9",
    title: "Home runs allowed per nine innings",
  },
  { key: "walksPer9Inn", label: "BB9", title: "Walks per nine innings" },
  {
    key: "strikeoutsPer9Inn",
    label: "SO9",
    title: "Strikeouts per nine innings",
  },
  { key: "strikeoutWalkRatio", label: "SO/W", title: "Strikeouts per walk" },
];

export const CAREER_FIELDING_COLS: TeamStatCol[] = PLAYER_FIELDING_COLS;

export const careerCols = (group: StatGroup): TeamStatCol[] =>
  group === "hitting"
    ? CAREER_HITTING_COLS
    : group === "pitching"
      ? CAREER_PITCHING_COLS
      : CAREER_FIELDING_COLS;

/* ── The advanced line ──────────────────────────────────────────────── */

/*
 * What MLB's sabermetrics feed carries beyond the standard line. The feed is
 * already fetched for every career table — WAR rides on it — so these cost
 * nothing new to show; they were simply being dropped on the floor.
 *
 * Rbat's neighbour Rfield is deliberately absent: the feed calls it
 * `fielding`, which is already the key of a fielding line's own FPCT, and one
 * key meaning two things would have the sabermetric figure overwrite the
 * percentage on the fielding table.
 */
export const ADVANCED_HITTING_COLS: TeamStatCol[] = [
  {
    key: "war",
    label: "WAR",
    title: "Wins above replacement (FanGraphs, via MLB)",
  },
  { key: "rar", label: "RAR", title: "Runs above replacement" },
  {
    key: "woba",
    label: "wOBA",
    title:
      "Weighted on-base average — every way of reaching base at its run value",
  },
  { key: "wRc", label: "wRC", title: "Weighted runs created" },
  {
    key: "wRcPlus",
    label: "wRC+",
    title:
      "Weighted runs created against the league, park-adjusted — 100 is average",
  },
  { key: "wRaa", label: "wRAA", title: "Weighted runs above average" },
  { key: "batting", label: "Rbat", title: "Batting runs above average" },
  {
    key: "baseRunning",
    label: "Rbaser",
    title: "Base-running runs above average",
  },
  { key: "positional", label: "Rpos", title: "Positional adjustment runs" },
  {
    key: "replacement",
    label: "Rrep",
    title: "Runs above a replacement-level player",
  },
  { key: "spd", label: "SPD", title: "Speed score" },
  {
    key: "ubr",
    label: "UBR",
    title:
      "Ultimate base running — base-running run value outside stolen bases",
  },
  { key: "wSb", label: "wSB", title: "Weighted stolen-base runs" },
  { key: "wGdp", label: "wGDP", title: "Weighted double-play runs" },
];

export const ADVANCED_PITCHING_COLS: TeamStatCol[] = [
  {
    key: "war",
    label: "WAR",
    title: "Wins above replacement (FanGraphs, via MLB)",
  },
  {
    key: "ra9War",
    label: "RA9-WAR",
    title: "Wins above replacement figured from runs allowed rather than FIP",
  },
  { key: "rar", label: "RAR", title: "Runs above replacement" },
  { key: "fip", label: "FIP", title: "Fielding independent pitching" },
  {
    key: "xfip",
    label: "xFIP",
    title: "FIP with a league-average home-run rate on fly balls",
  },
  {
    key: "fipMinus",
    label: "FIP-",
    title: "FIP against the league — 100 is average, lower is better",
  },
  {
    key: "eraMinus",
    label: "ERA-",
    title: "ERA against the league — 100 is average, lower is better",
  },
  {
    key: "pli",
    label: "pLI",
    title: "Average leverage index on entering a game",
  },
  {
    key: "inli",
    label: "inLI",
    title: "Average leverage index over innings pitched",
  },
  {
    key: "gmli",
    label: "gmLI",
    title: "Average leverage index at the moment of entry",
  },
  {
    key: "exli",
    label: "exLI",
    title: "Average leverage index on leaving a game",
  },
  {
    key: "sd",
    label: "SD",
    title: "Shutdowns — relief outings that meaningfully helped the club win",
  },
  {
    key: "md",
    label: "MD",
    title: "Meltdowns — relief outings that meaningfully hurt it",
  },
];

/** The feed has no fielding line at all, so that group has no advanced view. */
export const advancedCols = (group: StatGroup): TeamStatCol[] =>
  group === "hitting"
    ? ADVANCED_HITTING_COLS
    : group === "pitching"
      ? ADVANCED_PITCHING_COLS
      : [];

/*
 * Which advanced figures a career line is the sum of. Runs and wins over a
 * baseline accumulate the way hits do; a rate against the league does not.
 * The ones left out are shown blank on a career line rather than added into
 * a number that would mean nothing — a summed wRC+ of 344 is not a career.
 */
const ADVANCED_ADDITIVE = new Set([
  "war",
  "rar",
  "wRaa",
  "wRc",
  "batting",
  "baseRunning",
  "positional",
  "replacement",
  "ubr",
  "wSb",
  "wGdp",
  "ra9War",
  "sd",
  "md",
]);

/* ── Summing stat lines ─────────────────────────────────────────────── */

/* The figures that are ratios of the others: adding them is meaningless, so
   they are dropped from the sum and worked out again from the totals. */
export const RATE_KEYS: Record<StatGroup, string[]> = {
  hitting: ["avg", "obp", "slg", "ops", "opsPlus"],
  pitching: [
    "era",
    "whip",
    "avg",
    "strikeoutsPer9Inn",
    "winPercentage",
    "hitsPer9Inn",
    "homeRunsPer9",
    "walksPer9Inn",
    "strikeoutWalkRatio",
    "fip",
    "eraPlus",
  ],
  fielding: ["fielding", "rangeFactorPer9Inn"],
};

/**
 * How a game log splits its columns: the counting stats belong to the game,
 * the rates only mean anything as a season line to date — one game's batting
 * average is noise, and the same label twice in a header is worse.
 */
export const gameLogCols = (
  group: StatGroup,
): { game: TeamStatCol[]; running: TeamStatCol[] } => {
  const rates = new Set(RATE_KEYS[group]);
  const cols = playerCols(group);
  /* Every row of a game log is one game, so the games columns are a column of
     1s and a column of 0s and 1s — they count seasons, not appearances, and
     belong to a season line rather than to this one. */
  const GAME_COUNTS = new Set(["gamesPlayed", "games", "gamesStarted"]);
  const counted = cols.filter((c) => !GAME_COUNTS.has(c.key));
  return {
    game: counted.filter((c) => !rates.has(c.key)),
    running: counted.filter((c) => rates.has(c.key)),
  };
};

/* Denominators the rates need that no column prints — a line has to carry
   them through the sum even though nothing shows them. */
const SUM_EXTRA = ["hitByPitch", "sacFlies", "totalBases", "atBats"];

/**
 * Every key a line has to carry to be summable: the printed columns plus the
 * denominators behind the rates. Reading only the columns is what silently
 * gives a game log a slugging percentage of .000 — no total bases came along.
 */
export const statLineKeys = (group: StatGroup): string[] => [
  ...new Set([
    ...playerCols(group).map((c) => c.key),
    ...careerCols(group).map((c) => c.key),
    ...SUM_EXTRA,
  ]),
];

/** ".254" — MLB writes a rate without its leading zero, and "—" for 0/0. */
const rate3 = (num: number, den: number): string | null =>
  den > 0 ? (num / den).toFixed(3).replace(/^0\./, ".") : null;

const num = (v: TeamStatValue) => teamStatNum(v) ?? 0;

/**
 * Several game (or month, or season) lines added into one, with every rate
 * worked out again from the totals rather than averaged — a season's average
 * is its hits over its at-bats, not the mean of 162 daily averages. Innings
 * are added as outs, since they are printed in thirds.
 */
export function sumStatLines(
  group: StatGroup,
  lines: Record<string, TeamStatValue>[],
): Record<string, TeamStatValue> {
  const rates = new Set(RATE_KEYS[group]);
  const innKey =
    group === "pitching"
      ? "inningsPitched"
      : group === "fielding"
        ? "innings"
        : "";
  /* Everything a line carries, not just what the narrow tables print: a club
     total is shown on the career table, whose columns are the wider set. */
  const keys = statLineKeys(group).filter((k) => !rates.has(k) && k !== innKey);

  const out: Record<string, TeamStatValue> = {};
  let outs = 0;
  for (const l of lines) {
    if (innKey) outs += outsOf(l[innKey]);
    for (const k of keys) {
      const n = teamStatNum(l[k]);
      if (n !== null) out[k] = ((out[k] as number) ?? 0) + n;
    }
  }

  if (group === "hitting") {
    const [ab, h, bb, hbp, sf, tb] = [
      num(out.atBats),
      num(out.hits),
      num(out.baseOnBalls),
      num(out.hitByPitch),
      num(out.sacFlies),
      num(out.totalBases),
    ];
    out.avg = rate3(h, ab);
    out.obp = rate3(h + bb + hbp, ab + bb + hbp + sf);
    out.slg = rate3(tb, ab);
    /* OPS is the two printed figures added, not the unrounded ratios — that
       is how MLB writes it, and a line whose own columns don't add up to its
       OPS reads as a bug even when the arithmetic is better. */
    out.ops =
      out.obp !== null && out.slg !== null
        ? (Number(out.obp) + Number(out.slg)).toFixed(3).replace(/^0\./, ".")
        : null;
  } else if (group === "pitching") {
    out.inningsPitched = inningsOf(outs);
    out.era = outs ? ((num(out.earnedRuns) * 27) / outs).toFixed(2) : null;
    out.whip = outs
      ? (((num(out.baseOnBalls) + num(out.hits)) * 3) / outs).toFixed(2)
      : null;
    out.avg = rate3(num(out.hits), num(out.atBats));
    const per9 = (v: TeamStatValue) =>
      outs ? ((num(v) * 27) / outs).toFixed(2) : null;
    out.strikeoutsPer9Inn = per9(out.strikeOuts);
    out.hitsPer9Inn = per9(out.hits);
    out.homeRunsPer9 = per9(out.homeRuns);
    out.walksPer9Inn = per9(out.baseOnBalls);
    const [w, l, bb] = [num(out.wins), num(out.losses), num(out.baseOnBalls)];
    out.winPercentage = rate3(w, w + l);
    out.strikeoutWalkRatio = bb ? (num(out.strikeOuts) / bb).toFixed(2) : null;
  } else {
    const [po, a, e] = [num(out.putOuts), num(out.assists), num(out.errors)];
    const tc = Math.max(num(out.chances), po + a + e);
    out.innings = inningsOf(outs);
    out.chances = tc;
    out.fielding = rate3(po + a, tc);
    out.rangeFactorPer9Inn = outs ? (((po + a) * 27) / outs).toFixed(2) : null;
  }
  /* Wins above replacement is a counting stat, so it adds — but a decimal
     one, and eleven seasons of binary floating point end in 30.100000000004
     unless the sum is pinned back to the one place it is written in. */
  if (typeof out.war === "number") out.war = out.war.toFixed(1);
  return out;
}

/* ── League leaders, for the marks on a career line ─────────────────── */

/*
 * A career line is read for the years a player led something, so those
 * figures are marked: bold for a league lead, italic for a major-league one.
 * MLB names its leader boards differently from the keys the same numbers
 * arrive under, so the two are mapped here; a column with no board simply
 * never gets a mark.
 */
const LEADER_CATEGORY: Record<string, string> = {
  gamesPlayed: "gamesPlayed",
  plateAppearances: "totalPlateAppearances",
  atBats: "atBats",
  runs: "runs",
  hits: "hits",
  doubles: "doubles",
  triples: "triples",
  homeRuns: "homeRuns",
  rbi: "runsBattedIn",
  stolenBases: "stolenBases",
  caughtStealing: "caughtStealing",
  baseOnBalls: "walks",
  strikeOuts: "strikeouts",
  avg: "battingAverage",
  obp: "onBasePercentage",
  slg: "sluggingPercentage",
  ops: "onBasePlusSlugging",
  totalBases: "totalBases",
  groundIntoDoublePlay: "groundIntoDoublePlays",
  hitByPitch: "hitByPitches",
  sacBunts: "sacrificeBunts",
  sacFlies: "sacrificeFlies",
  intentionalWalks: "intentionalWalks",
  wins: "wins",
  losses: "losses",
  winPercentage: "winPercentage",
  era: "earnedRunAverage",
  gamesStarted: "gamesStarted",
  gamesFinished: "gamesFinished",
  completeGames: "completeGames",
  shutouts: "shutouts",
  saves: "saves",
  inningsPitched: "inningsPitched",
  earnedRuns: "earnedRun",
  hitBatsmen: "hitBatsman",
  balks: "balk",
  wildPitches: "wildPitch",
  battersFaced: "totalBattersFaced",
  whip: "walksAndHitsPerInningPitched",
  hitsPer9Inn: "hitsPer9Inn",
  walksPer9Inn: "walksPer9Inn",
  strikeoutsPer9Inn: "strikeoutsPer9Inn",
  strikeoutWalkRatio: "strikeoutWalkRatio",
};

/** How a figure was led — the mark the career table puts on it. */
export type LedScope = "league" | "mlb";

/**
 * The leading value in every category a career table prints, for one season,
 * keyed `"<scope>:<column key>"` — scope being "mlb" or a league id.
 *
 * One request per scope: MLB will only answer for a single league at a time,
 * and the major-league lead is not the better of the two league leads — a
 * player traded across leagues can top the majors while leading neither, as
 * Nick Castellanos did in doubles in 2019. Boards are per season and league
 * rather than per player, so every player's page shares the same cached
 * payloads, and they hold for a day.
 */
export async function seasonLeaders(
  season: number,
  group: StatGroup,
  leagues: number[],
): Promise<Map<string, string>> {
  const cats = [
    ...new Set(
      careerCols(group)
        .map((c) => LEADER_CATEGORY[c.key])
        .filter(Boolean),
    ),
  ].join(",");
  const scopes: [string, string][] = [
    ["mlb", ""],
    ...leagues.map((id): [string, string] => [String(id), `&leagueId=${id}`]),
  ];

  const out = new Map<string, string>();
  await Promise.all(
    scopes.map(async ([scope, param]) => {
      const data = await mlb(
        `/stats/leaders?leaderCategories=${cats}&season=${season}` +
          `&statGroup=${group}&limit=1&sportId=1${param}`,
        86400,
      ).catch(() => null);
      for (const board of (data?.leagueLeaders ?? []) as any[]) {
        const value = board.leaders?.[0]?.value;
        if (value === undefined || value === null) continue;
        out.set(`${scope}:${board.leaderCategory}`, String(value));
      }
    }),
  );
  return out;
}

/**
 * Which of a line's figures led something. A season split by a trade is
 * compared against the majors only: the combined line belongs to no one
 * league, and each club's half is checked against the league it was played in.
 */
export function ledMarks(
  group: StatGroup,
  values: Record<string, TeamStatValue>,
  leaders: Map<string, string>,
  leagueId: number | null,
): Record<string, LedScope> {
  const marks: Record<string, LedScope> = {};
  for (const col of careerCols(group)) {
    const cat = LEADER_CATEGORY[col.key];
    if (!cat) continue;
    const mine = teamStatNum(values[col.key]);
    if (mine === null) continue;
    const same = (scope: string) => {
      const best = teamStatNum(leaders.get(`${scope}:${cat}`) ?? null);
      return best !== null && best === mine;
    };
    if (same("mlb")) marks[col.key] = "mlb";
    else if (leagueId !== null && same(String(leagueId)))
      marks[col.key] = "league";
  }
  return marks;
}

/* ── Sabermetrics ───────────────────────────────────────────────────── */

/*
 * MLB serves these unrounded — a WAR of 11.21668, a wRC+ of 218.663 — so each
 * is written the way it is actually quoted before it reaches a column.
 */
export const SABER_FORMAT: Record<string, (n: number) => string> = {
  war: (n) => n.toFixed(1),
  fip: (n) => n.toFixed(2),
  /* Runs and wins over a baseline are quoted to a tenth, the plus/minus
     stats as whole numbers, leverage to a hundredth, and wOBA as the rate it
     is — ".421", without its leading zero, like every other rate here. */
  rar: (n) => n.toFixed(1),
  ra9War: (n) => n.toFixed(1),
  wRaa: (n) => n.toFixed(1),
  batting: (n) => n.toFixed(1),
  baseRunning: (n) => n.toFixed(1),
  positional: (n) => n.toFixed(1),
  replacement: (n) => n.toFixed(1),
  ubr: (n) => n.toFixed(1),
  wSb: (n) => n.toFixed(1),
  wGdp: (n) => n.toFixed(1),
  spd: (n) => n.toFixed(1),
  wRc: (n) => n.toFixed(0),
  wRcPlus: (n) => n.toFixed(0),
  fipMinus: (n) => n.toFixed(0),
  eraMinus: (n) => n.toFixed(0),
  sd: (n) => n.toFixed(0),
  md: (n) => n.toFixed(0),
  xfip: (n) => n.toFixed(2),
  pli: (n) => n.toFixed(2),
  inli: (n) => n.toFixed(2),
  gmli: (n) => n.toFixed(2),
  exli: (n) => n.toFixed(2),
  woba: (n) => n.toFixed(3).replace(/^0\./, "."),
};

/** What a season's OPS+ or ERA+ is measured against. */
export interface LeagueLine {
  obp: number;
  slg: number;
  era: number;
}

/*
 * Park factors. A run is not worth the same in every yard, so a plus stat is
 * measured against the league's line adjusted for the one the player worked
 * in — Coors inflates a bat and a Petco arm looks better than it is.
 *
 * The factor is the club's scoring at home against its scoring on the road,
 * both sides of the ball, over a three-season window centred on the year:
 * one season of home-and-road splits is small enough that ordinary noise
 * moves it several points. It is then halved, since a player spends only half
 * his schedule in it.
 *
 * ponytail: a one-line factor computed off runs, not Baseball-Reference's,
 * which folds in the league a club actually faced and its own absence from
 * it. Expect a point or two of daylight against a B-Ref line rather than the
 * five or ten that no adjustment leaves. If it ever has to match to the unit,
 * their published per-club, per-season table is the only thing that will do.
 */

/** How many seasons either side of a year the factor averages over. */
const PARK_WINDOW = 1;

/** The factor from a window's raw home/road run ratios, halved for the half
 *  of a schedule played away from it. 1 — no adjustment — when there is none. */
export const parkFactorOf = (raws: number[]): number =>
  raws.length === 0
    ? 1
    : 1 + (raws.reduce((a, b) => a + b, 0) / raws.length - 1) / 2;

/**
 * One club-season's raw run ratio: runs scored and allowed per game at home
 * over the same on the road. Null when MLB has no home-and-road split for it,
 * which is every season it never played.
 */
async function parkRunRatio(
  teamId: number,
  season: number,
): Promise<number | null> {
  const data = await mlb(
    `/teams/${teamId}/stats?stats=statSplits&sitCodes=h,a` +
      `&group=hitting,pitching&season=${season}`,
    86400,
  ).catch(() => null);

  const at = (group: string, code: string) => {
    const split = ((data?.stats ?? []) as any[])
      .find((st) => st.group?.displayName === group)
      ?.splits?.find((sp: any) => sp.split?.code === code);
    return {
      runs: teamStatNum(split?.stat?.runs),
      games: teamStatNum(split?.stat?.gamesPlayed),
    };
  };
  const [hs, ha, ps, pa] = [
    at("hitting", "h"),
    at("hitting", "a"),
    at("pitching", "h"),
    at("pitching", "a"),
  ];
  if (
    hs.runs === null ||
    ha.runs === null ||
    ps.runs === null ||
    pa.runs === null ||
    !hs.games ||
    !ha.games
  )
    return null;

  const road = (ha.runs + pa.runs) / ha.games;
  return road > 0 ? (hs.runs + ps.runs) / hs.games / road : null;
}

/** A club's park factor for one season, over the window around it. */
async function parkFactor(teamId: number, season: number): Promise<number> {
  const years = Array.from(
    { length: PARK_WINDOW * 2 + 1 },
    (_, i) => season - PARK_WINDOW + i,
  );
  const raws = await Promise.all(years.map((y) => parkRunRatio(teamId, y)));
  return parkFactorOf(raws.filter((r): r is number => r !== null));
}

/** Everything a league's batting line has to carry to give up its rates. */
const LEAGUE_BAT_KEYS = [
  "hits",
  "atBats",
  "baseOnBalls",
  "hitByPitch",
  "sacFlies",
  "totalBases",
];

/** Which clubs were in which league that season — what splits the thirty
 *  clubs' totals into the two lines a plus stat is measured against. */
async function leaguesOf(season: number): Promise<Map<number, number>> {
  const data = await mlb(`/teams?sportId=1&season=${season}`, 86400).catch(
    () => null,
  );
  return new Map(
    ((data?.teams ?? []) as any[])
      .filter((t) => t.id && t.league?.id)
      .map((t) => [t.id as number, t.league.id as number]),
  );
}

/** Which club was in which division that season — the same payload the
 *  leagues are read off, so it costs no second request. */
export async function divisionsOf(season: number): Promise<Map<number, number>> {
  const data = await mlb(`/teams?sportId=1&season=${season}`, 86400).catch(
    () => null,
  );
  return new Map(
    ((data?.teams ?? []) as any[])
      .filter((t) => t.id && t.division?.id)
      .map((t) => [t.id as number, t.division.id as number]),
  );
}

/*
 * What the league's pitchers did at the plate. A plus stat measures a hitter
 * against the hitters, and until the designated hitter went universal in 2022
 * the National League's line carried nine seasons of pitchers batting .130 in
 * it — leaving them in understates the league and overstates every bat in it
 * by the better part of ten points.
 *
 * Two-way players are filed under their own position, not P, so Ohtani's bat
 * stays in the league where it belongs.
 */
async function leaguePitcherBats(
  season: number,
): Promise<Map<number | null, Record<string, number>>> {
  const out = new Map<number | null, Record<string, number>>();
  /* One page is enough for a live season; two covers the deepest staffs the
     hundred-odd years before it. */
  for (const offset of [0, 1000]) {
    const data = await mlb(
      `/stats?stats=season&group=hitting&season=${season}&sportId=1` +
        `&playerPool=ALL&position=P&limit=1000&offset=${offset}`,
      86400,
    ).catch(() => null);
    const splits = (data?.stats?.[0]?.splits ?? []) as any[];
    if (splits.length === 0) break;
    for (const sp of splits) {
      const league = sp.league?.id ?? null;
      for (const k of new Set<number | null>([league, null])) {
        const d = out.get(k) ?? out.set(k, {}).get(k)!;
        for (const stat of LEAGUE_BAT_KEYS)
          d[stat] = (d[stat] ?? 0) + (teamStatNum(sp.stat?.[stat]) ?? 0);
      }
    }
    if (splits.length < 1000) break;
  }
  return out;
}

/*
 * The league's own line for a season, added up from its clubs' totals — the
 * only league line the API will hand over. MLB publishes neither OPS+ nor
 * ERA+, so both are figured here the conventional way against it. Keyed by
 * league id, with `null` holding the whole of the majors for the lines that
 * belong to no one league: a season split across both, and the career total.
 *
 * ponytail: no park factor, because no MLB feed publishes one. That is the
 * whole of the remaining gap to Baseball-Reference — a few points in a
 * neutral yard, five or six in an extreme one, and in the direction the park
 * plays. A per-club, per-season park-factor table is what would close it;
 * both columns say what they are in their own tooltips until there is one.
 */
export async function leagueRates(
  season: number,
  group: StatGroup,
): Promise<Map<number | null, LeagueLine>> {
  const out = new Map<number | null, LeagueLine>();
  if (group === "fielding") return out;
  const [data, leagues, arms] = await Promise.all([
    mlb(
      `/teams/stats?season=${season}&group=${group}&stats=season&sportIds=1`,
      86400,
    ).catch(() => null),
    leaguesOf(season),
    /* Only a batting line has pitchers to take out of it. */
    group === "hitting"
      ? leaguePitcherBats(season).catch(
          () => new Map<number | null, Record<string, number>>(),
        )
      : new Map<number | null, Record<string, number>>(),
  ]);
  const splits = (data?.stats?.[0]?.splits ?? []) as any[];
  if (splits.length === 0) return out;

  /* Every club counts twice: once for its own league, once for the majors. */
  const tot = new Map<number | null, Record<string, number>>();
  for (const sp of splits) {
    const league = leagues.get(sp.team?.id) ?? null;
    for (const key of new Set<number | null>([league, null])) {
      const d = tot.get(key) ?? tot.set(key, {}).get(key)!;
      for (const k of [...LEAGUE_BAT_KEYS, "earnedRuns"])
        d[k] = (d[k] ?? 0) + (teamStatNum(sp.stat?.[k]) ?? 0);
      /* Innings print in thirds, so the league's are added as outs. */
      d.outs = (d.outs ?? 0) + outsOf(sp.stat?.inningsPitched);
    }
  }

  /* The bats a plus stat is measured against are the ones it competes with,
     which never included the pitchers taking their turn. */
  for (const [key, d] of tot) {
    const off = arms.get(key);
    if (!off) continue;
    for (const k of LEAGUE_BAT_KEYS) d[k] = Math.max(0, d[k] - (off[k] ?? 0));
  }

  for (const [key, d] of tot) {
    if (group === "pitching") {
      if (d.outs > 0)
        out.set(key, { obp: 0, slg: 0, era: (d.earnedRuns * 27) / d.outs });
      continue;
    }
    const onBase = d.atBats + d.baseOnBalls + d.hitByPitch + d.sacFlies;
    if (!onBase || !d.atBats) continue;
    out.set(key, {
      obp: (d.hits + d.baseOnBalls + d.hitByPitch) / onBase,
      slg: d.totalBases / d.atBats,
      era: 0,
    });
  }
  return out;
}

/**
 * One line's OPS+ against the league's: on-base and slugging each measured
 * against it, added, less one — 100 being an average bat. Null wherever
 * either half is missing, which is a season with no league line and a line
 * with no plate appearances.
 */
export const opsPlus = (
  values: Record<string, TeamStatValue>,
  lg: LeagueLine | null | undefined,
): string | null => {
  const obp = teamStatNum(values.obp);
  const slg = teamStatNum(values.slg);
  if (!lg?.obp || !lg?.slg || obp === null || slg === null) return null;
  return Math.round(100 * (obp / lg.obp + slg / lg.slg - 1)).toString();
};

/**
 * The same figure for an arm, the other way up: the league's earned-run
 * average over his, so that 100 is average and higher is better — which is
 * why it reads as a plus where the raw ERA reads as a minus.
 */
export const eraPlus = (
  values: Record<string, TeamStatValue>,
  lg: LeagueLine | null | undefined,
): string | null => {
  const era = teamStatNum(values.era);
  if (!lg?.era || era === null || era <= 0) return null;
  return Math.round((100 * lg.era) / era).toString();
};

/*
 * Runs are not linear in the rates that produce them: a park that gives up
 * three per cent more runs does not give up three per cent more on-base and
 * slugging, it gives up something nearer half that, because runs scale as
 * roughly the 1.8th power of what a lineup does at the plate. The factor is
 * measured in runs, so a rate is adjusted by its root and an earned-run
 * average — a run rate itself — by the factor whole.
 *
 * ponytail: 1.8 is the textbook elasticity, not a fit to this data.
 */
const RUN_ELASTICITY = 1.8;

/** A league line as it played in one park — what a plus stat is actually
 *  measured against, since an average bat in Coors outhits one in Petco. */
const parked = (lg: LeagueLine, park: number): LeagueLine => {
  const rate = park ** (1 / RUN_ELASTICITY);
  return { obp: lg.obp * rate, slg: lg.slg * rate, era: lg.era * park };
};

/**
 * A rate carried onto a career line: each season's, weighted by how much of
 * that season the player actually played. A career ERA+ measured against the
 * mean of eleven league ERAs would let a season he threw four innings in
 * count as much as one he threw two hundred.
 */
const weightedMean = (
  parts: { weight: number; value: number | null }[],
): number | null => {
  let sum = 0;
  let weight = 0;
  for (const p of parts) {
    if (p.value === null || p.weight <= 0) continue;
    sum += p.value * p.weight;
    weight += p.weight;
  }
  return weight > 0 ? sum / weight : null;
};

/** The sabermetric keys a group's career table prints. */
const saberKeys = (group: StatGroup): string[] =>
  [
    ...new Set(
      [...careerCols(group), ...advancedCols(group)].map((c) => c.key),
    ),
  ].filter((k) => k in SABER_FORMAT);

/**
 * WAR and its neighbours for a set of seasons, keyed `"<season>:<team id>"`
 * the way the career rows are — a season a trade split answers with a line
 * per club and a combined one carrying no club at all, which is exactly the
 * shape the table already reads.
 *
 * One request per season, because the feed answers for a single season at a
 * time and refuses a list. They go out together and hold for a day.
 */
async function getPlayerSabermetrics(
  id: number,
  group: StatGroup,
  seasons: string[],
): Promise<Map<string, Record<string, TeamStatValue>>> {
  const keys = saberKeys(group);
  const out = new Map<string, Record<string, TeamStatValue>>();
  if (keys.length === 0) return out;

  await Promise.all(
    seasons.map(async (season) => {
      const data = await mlb(
        `/people/${id}/stats?stats=sabermetrics&group=${group}&season=${season}`,
        86400,
      ).catch(() => null);
      for (const split of (data?.stats?.[0]?.splits ?? []) as any[]) {
        const line: Record<string, TeamStatValue> = {};
        for (const k of keys) {
          const n = teamStatNum(split.stat?.[k]);
          line[k] = n === null ? null : SABER_FORMAT[k](n);
        }
        out.set(`${season}:${split.team?.id ?? ""}`, line);
      }
    }),
  );
  return out;
}

/* ── Career, season by season ───────────────────────────────────────── */

/** One line of the career table — a season with a club, or the career total. */
export interface CareerRow {
  /** "" for the total lines, which belong to no one season. */
  season: string;
  /** Three letters, which is all a stat table has room for. */
  team: string;
  /** The whole of it, for the places that read as prose. */
  teamName: string;
  teamId: number | null;
  /** As MLB reports it for that season. */
  age: number | null;
  /** "AL" / "NL", or "2LG" on a season split across both. */
  league: string;
  /**
   * How many clubs the line covers. 1 for an ordinary season; 2 or more on
   * the combined line of a season a trade split, whose per-club lines follow
   * it. A reader wants the season first and the halves under it.
   */
  teams: number;
  /** Which figures on this line led their league or the majors, by column. */
  led: Record<string, LedScope>;
  /** The league line this season is measured against, already moved for the
   *  park — what OPS+ and ERA+ were figured from, kept so a line added up on
   *  the page (a picked span of seasons) can blend them the same way. */
  lg?: LeagueLine | null;
  /** The majors he won that season — empty on a split season's halves, which
   *  would otherwise print the same MVP twice under one year. */
  awards: PlayerAward[];
  values: Record<string, TeamStatValue>;
}

/**
 * The figures a summed line cannot get by adding — OPS+, ERA+, FIP. A plus
 * stat is a ratio to a league that changes every year and FIP is a rate over
 * innings, so each is the seasons the line covers blended by what the player
 * actually did in them: a bat by its trips to the plate, an arm by its outs,
 * never by the club's or the league's playing time.
 *
 * Written in place, on `values`, from rows carrying the `lg` they were figured
 * against. Postseason and fielding lines have none and are left alone.
 */
export function fillPlusLine(
  group: StatGroup,
  values: Record<string, TeamStatValue>,
  from: CareerRow[],
): void {
  if (group === "fielding" || !from.some((r) => r.lg)) return;
  const parts = from.map((r) => ({
    weight:
      group === "hitting"
        ? (teamStatNum(r.values.plateAppearances) ?? 0)
        : outsOf(r.values.inningsPitched),
    line: r.lg ?? null,
    values: r.values,
  }));
  const mean = (pick: (p: (typeof parts)[number]) => number | null) =>
    weightedMean(parts.map((p) => ({ weight: p.weight, value: pick(p) })));

  /* Each season's line is already parked, so the blend carries the parks he
     played in, in the proportion he played in them. */
  const blend = {
    obp: mean((p) => p.line?.obp ?? null) ?? 0,
    slg: mean((p) => p.line?.slg ?? null) ?? 0,
    era: mean((p) => p.line?.era ?? null) ?? 0,
  };
  if (group === "hitting") values.opsPlus = opsPlus(values, blend);
  else {
    values.eraPlus = eraPlus(values, blend);
    const fip = mean((p) => teamStatNum(p.values.fip));
    values.fip = fip === null ? null : fip.toFixed(2);
  }
}

/**
 * Fills in those figures on a line built inside getPlayerCareer, where the
 * league lines and park factors are, and handed to whatever needs to write one.
 */
type FillPlus = (
  values: Record<string, TeamStatValue>,
  from: CareerRow[],
) => void;

/** A line under the table that is not a season — the career, a club, a league. */
export interface CareerSummary {
  label: string;
  /** "9 Yrs", the span the line covers. */
  span: string;
  /** Which block it belongs to: 0 the career, 1 the clubs, 2 the leagues. */
  band: number;
  values: Record<string, TeamStatValue>;
}

export interface CareerTable {
  rows: CareerRow[];
  /** The career line under them. Null when the player has never had one. */
  total: Record<string, TeamStatValue> | null;
  /**
   * The block beneath the seasons: the career, its per-162-game rate, then
   * one line per club and per league — but only when there is more than one
   * of either, since "BOS (9 Yrs)" under a nine-year Red Sox career is the
   * career line said twice.
   */
  summaries: CareerSummary[];
}

/**
 * A player's season-by-season line in one group, oldest first, with the
 * career total under it. `postseason` reads the October ledger instead.
 *
 * That is asked for as a game type rather than through MLB's own
 * `yearByYearPlayoffs` stat type, which answers with the regular season —
 * whatever it was meant to do, what it returns is the wrong ledger under the
 * right name, and a post-season table showing 62 home runs is worse than none.
 *
 * `hydrate=team` is what puts a club's three letters on each row; the id
 * alone would only get us a logo. Minor-league seasons are dropped: a page
 * that shows major-league columns should not quietly mix in Double-A.
 */
export async function getPlayerCareer(
  id: number,
  group: StatGroup,
  postseason = false,
): Promise<CareerTable> {
  const [data, awards] = await Promise.all([
    mlb(
      `/people/${id}/stats?stats=yearByYear,career&group=${group}&sportId=1` +
        `&hydrate=team${postseason ? "&gameType=P" : ""}`,
      86400,
    ).catch((e: Error) => {
      if (e.message.includes(" 404:")) return null;
      throw e;
    }),
    /* What he won each year, the way a printed career line carries it. The
       same request backs the bio and all three groups' tables, so Next's
       fetch cache answers every one of them but the first. */
    getPlayerAwards(id).catch((): PlayerAward[] => []),
  ]);

  const keys = statLineKeys(group);
  const values = (stat: any) =>
    Object.fromEntries(keys.map((k) => [k, stat?.[k] ?? null]));
  const stats = (data?.stats ?? []) as any[];
  const yearly =
    stats.find((s) => s.type?.displayName === "yearByYear")?.splits ?? [];
  const career =
    stats.find((s) => s.type?.displayName === "career")?.splits ?? [];

  const raw: CareerRow[] = (yearly as any[])
    .filter((s) => s.sport?.id === undefined || s.sport.id === 1)
    .map((s) => {
      const teams = Number(s.numTeams) || 1;
      const season = String(s.season ?? "");
      return {
        season,
        /* MLB leaves the combined line of a split season with no club at all;
           it is the season's own line, so it says how many. */
        team:
          teams > 1
            ? `${teams}TM`
            : (s.team?.abbreviation ?? s.team?.name ?? "—"),
        teamName: teams > 1 ? `${teams} TEAMS` : (s.team?.name ?? "—"),
        teamId: teams > 1 ? null : (s.team?.id ?? null),
        age: teamStatNum(s.stat?.age),
        league: teams > 1 ? "" : leagueAbbr(s.league?.id),
        teams,
        led: {},
        awards: [],
        values: values(s.stat),
      };
    });

  const rows =
    group === "fielding" ? mergeSeasons(group, raw) : orderSeasons(raw);

  /* WAR and its neighbours ride alongside the standard line rather than in a
     table of their own — a career is read for them as much as for the hits.
     October has no such feed, so a post-season table simply goes without. */
  if (!postseason && saberKeys(group).length > 0 && rows.length > 0) {
    const saber = await getPlayerSabermetrics(id, group, [
      ...new Set(rows.map((r) => r.season)),
    ]);
    for (const r of rows)
      Object.assign(r.values, saber.get(`${r.season}:${r.teamId ?? ""}`) ?? {});
  }
  /* A split season's combined line has no league of its own; naming both is
     what the line is for. */
  for (const r of rows)
    if (r.teams > 1)
      r.league = leagueSpan(
        rows.filter((o: CareerRow) => o.season === r.season && o.teams === 1),
      );

  /* An award belongs to the season, not to either club he played it for, so
     it goes on the line that is the whole season — the combined line where a
     trade split one, and the lone club's line otherwise. October's table is
     the same seasons over again and would say each award a second time. */
  /* The ballot says the same thing the win does and more — where he finished
     and on how many points — so a placement replaces the won award it covers,
     and stands on its own for the seasons he polled without winning. */
  const votes = ballotAwards(id);
  const covered = new Set(votes.map((v) => `${v.id}:${v.season}`));
  const all = [
    ...awards.filter((a) => !covered.has(`${a.id}:${a.season}`)),
    ...votes,
  ];
  if (!postseason)
    for (const r of rows)
      if (!isSplitPart(rows, r))
        r.awards = lineAwards(all.filter((a) => a.season === r.season));

  /* The marks on the line. Only a regular season has leader boards, and a
     fielding line is not one anybody leads. */
  if (!postseason && group !== "fielding" && rows.length > 0) {
    const seasons = [...new Set(rows.map((r) => r.season))];
    const boards = new Map(
      await Promise.all(
        seasons.map(
          async (season) =>
            [
              season,
              await seasonLeaders(Number(season), group, [
                ...new Set(
                  rows
                    .filter((r) => r.season === season && r.teams === 1)
                    .map((r) => leagueIdOf(r.league))
                    .filter((id): id is number => id !== null),
                ),
              ]),
            ] as const,
        ),
      ),
    );
    for (const r of rows)
      r.led = ledMarks(
        group,
        r.values,
        boards.get(r.season) ?? new Map(),
        r.teams > 1 ? null : leagueIdOf(r.league),
      );
  }

  const total =
    group === "fielding"
      ? career.length > 0
        ? sumStatLines(
            group,
            (career as any[]).map((c) => values(c.stat)),
          )
        : null
      : career[0]?.stat
        ? values(career[0].stat)
        : null;

  /* MLB has no career sabermetric line, so the career's WAR is its seasons
     added up — which is what a career WAR is. The same holds for the runs and
     wins the advanced view is read for. Everything else on the career line is
     MLB's own and stays that way, and the rates beside WAR — wOBA, wRC+, the
     minus stats, leverage — cannot be added at all, so they stay blank rather
     than becoming a figure that would mean nothing. */
  if (total && !postseason) {
    const parts = rows.filter((r) => r.teams === 1).map((r) => r.values);
    for (const key of saberKeys(group).filter((k) =>
      ADVANCED_ADDITIVE.has(k),
    )) {
      const nums = parts
        .map((p) => teamStatNum(p[key]))
        .filter((n): n is number => n !== null);
      total[key] = nums.length
        ? SABER_FORMAT[key](nums.reduce((a, b) => a + b, 0))
        : null;
    }
  }

  /* OPS+ and ERA+ are figured here rather than fetched — one league line per
     season the player had, shared by every player's page and held for a day.
     The career is measured against the league he actually played in: those
     same lines, weighted by his own time in each. FIP has a feed but no
     career line of its own, so it is averaged the same way.
     October has no league line to be measured against and goes without. */
  /* Set below once the league lines are in hand, and handed on to the summary
     bands, which need the same blend over their own slice of the seasons. */
  let fillPlus: FillPlus | undefined;
  if (!postseason && group !== "fielding" && rows.length > 0) {
    const key = group === "hitting" ? "opsPlus" : "eraPlus";
    const plus = group === "hitting" ? opsPlus : eraPlus;
    const lg = new Map(
      await Promise.all(
        [...new Set(rows.map((r) => r.season))].map(
          async (season) =>
            [season, await leagueRates(Number(season), group)] as const,
        ),
      ),
    );
    /* One factor per club-season on the table. A season a trade split has no
       park of its own — its halves are below it, and the combined line takes
       the two weighted by the games played in each. */
    const clubs = [
      ...new Set(
        rows
          .filter((r) => r.teamId !== null)
          .map((r) => `${r.season}:${r.teamId}`),
      ),
    ];
    const parks = new Map(
      await Promise.all(
        clubs.map(async (k) => {
          const [season, team] = k.split(":");
          return [k, await parkFactor(Number(team), Number(season))] as const;
        }),
      ),
    );
    const parkOf = (r: CareerRow): number => {
      if (r.teamId !== null) return parks.get(`${r.season}:${r.teamId}`) ?? 1;
      const halves = rows.filter((o) => o.season === r.season && o.teams === 1);
      return (
        weightedMean(
          halves.map((h) => ({
            weight: teamStatNum(h.values.gamesPlayed) ?? 0,
            value: parkOf(h),
          })),
        ) ?? 1
      );
    };

    /* Measured against his own league, the way a plus stat is defined, with
       that line moved by the park he played in: a hitter's park raises what
       an average bat there would have done, and lowers what his own did
       against it. A season split across both leagues has none of its own, so
       it falls back to the whole of the majors — as does the career, which is
       a blend of the lines below weighted by what he did in each. */
    const lineOf = (r: CareerRow): LeagueLine | null => {
      const table = lg.get(r.season);
      const line = table?.get(leagueIdOf(r.league)) ?? table?.get(null) ?? null;
      return line && parked(line, parkOf(r));
    };
    for (const r of rows) {
      r.lg = lineOf(r);
      r.values[key] = plus(r.values, r.lg);
    }

    /* The same figures on a line that is several seasons added together — the
       career, a club, a league, or a span picked on the page, which runs the
       blend itself off the lines carried on the rows. */
    fillPlus = (values, from) => fillPlusLine(group, values, from);
  }
  if (total && fillPlus)
    fillPlus(
      total,
      rows.filter((r) => r.teams === 1),
    );

  return {
    rows,
    total,
    summaries: summarise(group, rows, total, postseason, fillPlus),
  };
}

/**
 * Fielding arrives one line per position, so a season with one club is
 * several lines and none of them is his year. Added together, with the rates
 * worked out again, they are.
 *
 * The combined line of a season a trade split is rebuilt rather than kept:
 * MLB answers with one carrying games but no innings, chances or putouts, and
 * a season that fielded nothing is worse than no line at all. The halves add
 * up to it.
 */
function mergeSeasons(group: StatGroup, rows: CareerRow[]): CareerRow[] {
  const by = new Map<string, CareerRow[]>();
  for (const r of rows.filter((r) => r.teams === 1)) {
    const key = `${r.season}:${r.teamId}`;
    (by.get(key) ?? by.set(key, []).get(key)!).push(r);
  }
  const clubs = [...by.values()].map((lines) => ({
    ...lines[0],
    values: sumStatLines(
      group,
      lines.map((l) => l.values),
    ),
  }));

  const split = new Map<string, CareerRow[]>();
  for (const r of clubs)
    (split.get(r.season) ?? split.set(r.season, []).get(r.season)!).push(r);

  return orderSeasons([
    ...clubs,
    ...[...split.entries()]
      .filter(([, of]) => of.length > 1)
      .map(([season, of]) => ({
        ...of[0],
        season,
        team: `${of.length}TM`,
        teamName: `${of.length} TEAMS`,
        teamId: null,
        teams: of.length,
        values: sumStatLines(
          group,
          of.map((r) => r.values),
        ),
      })),
  ]);
}

/** An empty table — what a caller falls back to when the career won't load. */
export const EMPTY_CAREER: CareerTable = {
  rows: [],
  total: null,
  summaries: [],
};

/** True for a per-club line of a season a trade split, which sits under the
 *  season's combined line on the career table rather than standing on its
 *  own. Shared by the career table's own indenting and by whichever line
 *  reads a season as a single row. */
export function isSplitPart(rows: CareerRow[], r: CareerRow): boolean {
  return (
    r.teams === 1 && rows.some((o) => o.season === r.season && o.teams > 1)
  );
}

/** The one row that is a season's whole line — the lone team's row in an
 *  ordinary year, the combined line in a season split by trade. Powers the
 *  compare page's season scope, where a per-club split has no meaning. */
export function wholeSeasonRow(
  table: CareerTable,
  season: number,
): CareerRow | null {
  const s = String(season);
  return (
    table.rows.find((r) => r.season === s && !isSplitPart(table.rows, r)) ??
    null
  );
}

/** "AL", "NL", or "" for anything MLB didn't name. */
export const leagueAbbr = (id: number | undefined): string =>
  id === 103 ? "AL" : id === 104 ? "NL" : "";

export const leagueIdOf = (abbr: string): number | null =>
  abbr === "AL" ? 103 : abbr === "NL" ? 104 : null;

/** The leagues a set of lines spans — "AL", or "2LG" once it is both. */
const leagueSpan = (rows: CareerRow[]): string => {
  const leagues = [...new Set(rows.map((r) => r.league).filter(Boolean))];
  return leagues.length > 1 ? `${leagues.length}LG` : (leagues[0] ?? "");
};

/**
 * Seasons oldest first, and a season a trade split led by its combined line
 * with the clubs under it — MLB hands the halves over first and the whole
 * afterwards, which is the wrong way round to read.
 */
function orderSeasons(rows: CareerRow[]): CareerRow[] {
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  return seasons.flatMap((season) => {
    const of = rows.filter((r) => r.season === season);
    return [
      ...of.filter((r) => r.teams > 1),
      ...of.filter((r) => r.teams === 1),
    ];
  });
}

/**
 * The career's counting stats scaled to one season; the rates are already
 * per-season and pass through untouched.
 *
 * What "one season" divides by depends on who is being read. A hitter's line
 * is stretched to 162 games — the figure quoted as a 162-game average, and
 * what makes a part-time career comparable to a full one. A pitcher's cannot
 * be: he appears in a fraction of his club's games by the nature of the job,
 * and scaling Cole's career by his 335 appearances would have him winning 78
 * games and throwing 995 innings in a year. His line is divided by the
 * seasons he pitched instead, which is the average season it is read as.
 */
function seasonAverage(
  group: StatGroup,
  total: Record<string, TeamStatValue>,
  seasons: number,
): { label: string; values: Record<string, TeamStatValue> } | null {
  const games = teamStatNum(total.gamesPlayed) ?? 0;
  const scale =
    group === "hitting"
      ? games > 0
        ? 162 / games
        : 0
      : seasons > 0
        ? 1 / seasons
        : 0;
  if (scale <= 0) return null;

  const rates = new Set(RATE_KEYS[group]);
  const values: Record<string, TeamStatValue> = { ...total };
  for (const [k, v] of Object.entries(total)) {
    if (rates.has(k)) continue;
    /* Innings print in thirds, so they are scaled as outs and written back. */
    if (k === "inningsPitched" || k === "innings") {
      values[k] = inningsOf(Math.round(outsOf(v) * scale));
      continue;
    }
    const n = teamStatNum(v);
    if (n === null) continue;
    /* Everything here is a whole thing counted except WAR, which is written
       to a tenth — rounding it off would turn 3.8 wins into 4. */
    values[k] = k === "war" ? (n * scale).toFixed(1) : Math.round(n * scale);
  }
  return {
    label: group === "hitting" ? "162 GAME AVG" : "PER SEASON",
    values,
  };
}

/** How many seasons a set of lines covers — "9 Yrs". */
const yearSpan = (rows: CareerRow[]): string => {
  const years = new Set(rows.map((r) => r.season)).size;
  return `${years} Yr${years === 1 ? "" : "s"}`;
};

/**
 * The block under the seasons. The clubs and leagues are summed from the
 * per-club lines only — a split season's combined line is those same games
 * counted a second time, and adding it would double them.
 */
function summarise(
  group: StatGroup,
  rows: CareerRow[],
  total: Record<string, TeamStatValue> | null,
  /** October plays as many games as a run lasts; there is no season to
      average it over, so the per-162 line is left off. */
  postseason: boolean,
  /** What writes the rates a club's or a league's line can't be summed into. */
  fillPlus?: FillPlus,
): CareerSummary[] {
  const parts = rows.filter((r) => r.teams === 1);
  if (parts.length === 0 || !total) return [];

  const out: CareerSummary[] = [
    { label: "CAREER", span: yearSpan(rows), band: 0, values: total },
  ];
  if (group !== "fielding" && !postseason) {
    const avg = seasonAverage(
      group,
      total,
      new Set(rows.map((r) => r.season)).size,
    );
    if (avg)
      out.push({ label: avg.label, span: "", band: 0, values: avg.values });
  }

  const bucket = (key: (r: CareerRow) => string) => {
    const by = new Map<string, CareerRow[]>();
    for (const r of parts) {
      const k = key(r);
      if (!k) continue;
      (by.get(k) ?? by.set(k, []).get(k)!).push(r);
    }
    return by;
  };

  const bands = [bucket((r) => r.team), bucket((r) => r.league)];
  bands.forEach((by, i) => {
    if (by.size < 2) return;
    for (const [label, lines] of by) {
      const values = sumStatLines(
        group,
        lines.map((l) => l.values),
      );
      /* Measured against the league those seasons were played in, not the
         whole career's — a club line is the years he spent there. */
      fillPlus?.(values, lines);
      out.push({ label, span: yearSpan(lines), band: i + 1, values });
    }
  });
  return out;
}

/* ── Awards ─────────────────────────────────────────────────────────── */

/*
 * The awards a career is actually read for, by MLB's own id — a bio that also
 * lists Player of the Week for the third time in a July buries the MVP under
 * it. Everything outside this table is dropped rather than ranked last: the
 * feed carries a couple of hundred club, farm and winter-league honours, and
 * none of them belong on a major-league line.
 *
 * `short` is what the career table prints in its AWARDS column; the vote-taken
 * ones are written the way a printed line writes them — "MVP-1" for the win.
 * MLB publishes only the winner of a vote, never the ballot, so a finish of
 * second or twelfth is not on record anywhere here; see the award page.
 *
 * `pos` marks the awards given per position, which the bio names — a Silver
 * Slugger is an outfielder's or a catcher's, and that is most of the fact.
 */
export const MAJOR_AWARDS: Record<
  string,
  { label: string; short: string; rank: number; pos?: true }
> = {
  WSCHAMP: { label: "World Series Champion", short: "WS", rank: 0 },
  WSMVP: { label: "World Series MVP", short: "WS-MVP", rank: 1 },
  ALCSMVP: { label: "ALCS MVP", short: "LCS-MVP", rank: 2 },
  NLCSMVP: { label: "NLCS MVP", short: "LCS-MVP", rank: 2 },
  ALMVP: { label: "AL MVP", short: "MVP-1", rank: 3 },
  NLMVP: { label: "NL MVP", short: "MVP-1", rank: 3 },
  ALCY: { label: "AL Cy Young", short: "CY-1", rank: 4 },
  NLCY: { label: "NL Cy Young", short: "CY-1", rank: 4 },
  ALROY: { label: "AL Rookie of the Year", short: "ROY-1", rank: 5 },
  NLROY: { label: "NL Rookie of the Year", short: "ROY-1", rank: 5 },
  ALMOY: { label: "AL Manager of the Year", short: "MOY-1", rank: 5.5 },
  NLMOY: { label: "NL Manager of the Year", short: "MOY-1", rank: 5.5 },
  ALPG: { label: "AL Platinum Glove", short: "PG", rank: 6, pos: true },
  NLPG: { label: "NL Platinum Glove", short: "PG", rank: 6, pos: true },
  ALSS: { label: "AL Silver Slugger", short: "SS", rank: 7, pos: true },
  NLSS: { label: "NL Silver Slugger", short: "SS", rank: 7, pos: true },
  ALGG: { label: "AL Gold Glove", short: "GG", rank: 8, pos: true },
  NLGG: { label: "NL Gold Glove", short: "GG", rank: 8, pos: true },
  MLBAFIRST: { label: "All-MLB First Team", short: "AM1", rank: 9, pos: true },
  MLBSECOND: {
    label: "All-MLB Second Team",
    short: "AM2",
    rank: 10,
    pos: true,
  },
  ASMVP: { label: "All-Star Game MVP", short: "AS-MVP", rank: 11 },
  ALAS: { label: "AL All-Star", short: "AS", rank: 12 },
  NLAS: { label: "NL All-Star", short: "AS", rank: 12 },
};

/*
 * Which of them ride on the career line itself, and in what order inside a
 * season — "AS,MVP-1,SS", the way a printed line writes it. Deliberately
 * narrower than the highlights above: a World Series ring or an All-MLB team
 * belongs in the bio, not in a column read across twenty seasons.
 */
const LINE_AWARDS: Record<string, number> = {
  ALAS: 0,
  NLAS: 0,
  ALMVP: 1,
  NLMVP: 1,
  ALCY: 2,
  NLCY: 2,
  ALROY: 3,
  NLROY: 3,
  ALSS: 4,
  NLSS: 4,
  ALGG: 5,
  NLGG: 5,
};

/** The awards a career line carries, in the order it writes them. */
export const lineAwards = (awards: PlayerAward[]): PlayerAward[] =>
  awards
    .filter((a) => a.id in LINE_AWARDS)
    .sort((a, b) => LINE_AWARDS[a.id] - LINE_AWARDS[b.id]);

/** Every award the app knows how to show a page for. */
export const isMajorAward = (id: string) => id in MAJOR_AWARDS;

/** "AL MVP" — the award's own name, for a page title or a bio line. */
export const awardLabel = (id: string) =>
  MAJOR_AWARDS[id]?.label ?? AWARD_PAGE_LABEL[id] ?? id;

/** One major award a player won, in one season. */
export interface PlayerAward {
  /** MLB's id — "ALMVP". What the award page is keyed by. */
  id: string;
  season: string;
  /** "AL MVP", or "AL Silver Slugger (RF)" where the award is per position. */
  label: string;
  /** "MVP-1", "SS" — what the career table's AWARDS column prints. */
  short: string;
  rank: number;
}

/** The major awards a player has won, newest first. */
export async function getPlayerAwards(id: number): Promise<PlayerAward[]> {
  const data = await mlb(`/people/${id}/awards`, 86400).catch(() => null);
  const out: PlayerAward[] = [];
  for (const a of (data?.awards ?? []) as any[]) {
    const spec = MAJOR_AWARDS[a.id];
    if (!spec) continue;
    const pos = a.player?.primaryPosition?.abbreviation ?? "";
    out.push({
      id: a.id,
      season: String(a.season ?? ""),
      label: spec.pos && pos ? `${spec.label} (${pos})` : spec.label,
      short: spec.short,
      rank: spec.rank,
    });
  }
  return out.sort(
    (a, b) => Number(b.season) - Number(a.season) || a.rank - b.rank,
  );
}

/* ── The ballot ─────────────────────────────────────────────────────── */

/**
 * One line of one award's voting: who, where he finished, and on how many
 * points out of the most anyone could have had.
 *
 * MLB's feed names the winner and stops, so these come from the BBWAA's own
 * published results, scraped into `data/award-votes.json` by
 * `scripts/scrape_award_votes.py` — MVP, Cy Young and Rookie of the Year,
 * both leagues, 2003 through 2025. Re-run it when a November's results post.
 */
export interface AwardVote {
  /** MLB's award id, so a ballot line and a win are the same key — "ALMVP". */
  award: string;
  season: number;
  /** Where he finished. Ties share a place, and the next man down skips one. */
  rank: number;
  /** The player behind the name. Null on a manager, who has no player page. */
  id: number | null;
  name: string;
  /** The club as the ballot printed it — "Blue Jays". */
  club: string;
  points: number;
  /** Every point on offer: the voters times what a first-place vote is worth. */
  max: number;
  /** First-place votes. */
  first: number;
  /* A manager is his club, so his row is the club's season instead of a stat
     line: these are set on Manager of the Year ballots and nowhere else. */
  teamId?: number;
  team?: string;
  w?: number;
  l?: number;
  ties?: number;
  g?: number;
  pct?: string;
  finish?: number | null;
}

const VOTES = awardVotes as AwardVote[];

/* Indexed once, the two ways it gets read: a whole ballot for an award page,
   and one player's placements for his career line. A few thousand rows, so
   this is a map build at first use rather than anything cleverer. */
const ballots = new Map<string, AwardVote[]>();
const byVoter = new Map<number, AwardVote[]>();
for (const v of VOTES) {
  push(ballots, `${v.award}:${v.season}`, v);
  if (v.id !== null) push(byVoter, v.id, v);
}

/**
 * Every season with a ballot on record and which awards it has — what the
 * awards index is a list of. Newest first; a season missing an award is a page
 * the BBWAA never posted under the slug the scraper knows.
 */
export const ballotIndex = (): { season: number; awards: string[] }[] => {
  const by = new Map<number, string[]>();
  for (const v of VOTES) {
    const at = by.get(v.season) ?? [];
    if (!at.includes(v.award)) at.push(v.award);
    by.set(v.season, at);
  }
  return [...by]
    .sort((a, b) => b[0] - a[0])
    .map(([season, awards]) => ({
      season,
      awards: awards.sort(
        (a, b) => (MAJOR_AWARDS[a]?.rank ?? 99) - (MAJOR_AWARDS[b]?.rank ?? 99) || a.localeCompare(b),
      ),
    }));
};

/** One award's whole ballot, best finish first. Empty where none was scraped. */
export const awardBallot = (awardId: string, season: number): AwardVote[] =>
  ballots.get(`${awardId}:${season}`) ?? [];

/** "64%" — the share of the points on offer, the way a ballot prints it. */
export const voteShare = (v: AwardVote): string =>
  v.max > 0 ? `${Math.round((v.points / v.max) * 100)}%` : "—";

/**
 * A player's ballot placements as career-line awards — "MVP-2", "CY-4" — so a
 * season he finished second in reads on the line beside the ones he won.
 *
 * A placement supersedes the won award of the same name: both say he took the
 * 2022 MVP, but only the ballot line knows he did it on 410 of 420 points.
 */
export function ballotAwards(playerId: number): PlayerAward[] {
  return (byVoter.get(playerId) ?? []).map((v) => ({
    id: v.award,
    season: String(v.season),
    label: `${awardLabel(v.award)} — ${ordinal(v.rank)}, ${v.points} pts (${voteShare(v)})`,
    short: `${v.award.slice(2)}-${v.rank}`,
    rank: MAJOR_AWARDS[v.award]?.rank ?? 99,
  }));
}

/* ── One award, all time ────────────────────────────────────────────── */

/*
 * Every award the feed will answer for, in the order the index lists them:
 * the season votes first, then the relief and postseason awards, the ones
 * handed out through the year, the gloves and the bats, the named awards,
 * and at the foot the honours that are a career rather than a season.
 *
 * Deliberately wider than MAJOR_AWARDS above, which is what a career bio is
 * read by: the Chalmers Award ran four years and belongs on nobody's line,
 * but it is where the MVP starts and so it belongs in the index. Labels are
 * MLB's own, since these are the names the awards are announced under.
 */
export const AWARD_PAGES: { id: string; label: string }[] = [
  { id: "ALMVP", label: "AL MVP" },
  { id: "NLMVP", label: "NL MVP" },
  { id: "ALCHALM", label: "The Chalmers Award (AL)" },
  { id: "NLCHALM", label: "The Chalmers Award (NL)" },
  { id: "ALAWARD", label: "The American League Award" },
  { id: "NLAWARD", label: "The National League Award" },
  { id: "ALCY", label: "AL Cy Young" },
  { id: "NLCY", label: "NL Cy Young" },
  { id: "MLBCY", label: "MLB Cy Young" },
  { id: "ALROY", label: "Jackie Robinson AL Rookie of the Year" },
  { id: "NLROY", label: "Jackie Robinson NL Rookie of the Year" },
  { id: "MLBROY", label: "MLB Rookie of the Year" },
  { id: "ALREL", label: "Mariano Rivera AL Reliever of the Year" },
  { id: "NLREL", label: "Trevor Hoffman NL Reliever of the Year" },
  { id: "ALRM", label: "AL Relief Man Award" },
  { id: "NLRM", label: "NL Relief Man Award" },
  { id: "WSMVP", label: "Willie Mays World Series MVP" },
  { id: "ALCSMVP", label: "ALCS MVP" },
  { id: "NLCSMVP", label: "NLCS MVP" },
  { id: "ASMVP", label: "Ted Williams All-Star MVP" },
  { id: "ALPOM", label: "AL Player of the Month" },
  { id: "NLPOM", label: "NL Player of the Month" },
  { id: "ALPOW", label: "AL Player of the Week" },
  { id: "NLPOW", label: "NL Player of the Week" },
  { id: "ALPITOM", label: "AL Pitcher of the Month" },
  { id: "NLPITOM", label: "NL Pitcher of the Month" },
  { id: "ALROM", label: "AL Rookie of the Month" },
  { id: "NLROM", label: "NL Rookie of the Month" },
  { id: "ALRRELMON", label: "AL Reliever of the Month" },
  { id: "NLRRELMON", label: "NL Reliever of the Month" },
  { id: "ALMOY", label: "AL Manager of the Year" },
  { id: "NLMOY", label: "NL Manager of the Year" },
  { id: "MLBEXECOY", label: "MLB Executive of the Year" },
  { id: "DHLDMOY", label: "DHL Delivery Man of the Year" },
  { id: "DHLDMOM", label: "DHL Delivery Man of the Month" },
  { id: "ALCPOY", label: "AL Comeback Player of the Year" },
  { id: "NLCPOY", label: "NL Comeback Player of the Year" },
  { id: "DHOY", label: "Edgar Martinez Outstanding DH Award" },
  { id: "ALGG", label: "Rawlings AL Gold Glove" },
  { id: "NLGG", label: "Rawlings NL Gold Glove" },
  { id: "MLGG", label: "Rawlings MLB Gold Glove" },
  { id: "MLAGG", label: "Rawlings All-Time Gold Glove" },
  { id: "ALPG", label: "Rawlings AL Platinum Glove" },
  { id: "NLPG", label: "Rawlings NL Platinum Glove" },
  { id: "ALSS", label: "AL Silver Slugger" },
  { id: "NLSS", label: "NL Silver Slugger" },
  { id: "MLBAFIRST", label: "All-MLB First Team" },
  { id: "MLBSECOND", label: "All-MLB Second Team" },
  { id: "BAMLART", label: "Baseball America All-Rookie Team" },
  { id: "ALHAA", label: "AL Hank Aaron Award" },
  { id: "NLHAA", label: "NL Hank Aaron Award" },
  { id: "HUTCH", label: "The Hutch Award" },
  { id: "LOUGEHRIG", label: "Lou Gehrig Award" },
  { id: "BABERUTH", label: "Babe Ruth Award" },
  { id: "MLBRC", label: "Roberto Clemente Award" },
  { id: "LOUBROCK", label: "Lou Brock Award" },
  { id: "WARRENSPAHN", label: "Warren Spahn Award" },
  { id: "TONYCONIGLIARO", label: "Tony Conigliaro Award" },
  { id: "BOBFELLER", label: "Bob Feller Act of Valor Award" },
  { id: "WDPOY", label: "Wilson Defensive Player of the Year" },
  { id: "WMLBDPOY", label: "Wilson MLB Defensive Player of the Year" },
  { id: "WALDPOY", label: "Wilson AL Defensive Player of the Year" },
  { id: "WNLDPOY", label: "Wilson NL Defensive Player of the Year" },
  { id: "WTDPOY", label: "Wilson Team Defensive Player of the Year" },
  { id: "HEARTANDHUSTLE", label: "MLBPAA Heart and Hustle Award" },
  { id: "MLBPPHIL", label: "Players Trust Philanthropist of the Year" },
  { id: "MLBPCCFA", label: "Players Choice Curt Flood Award" },
  { id: "MLBCOMHA", label: "Commissioner's Historic Achievement Award" },
  { id: "MLBLEGEND", label: "MLB Legendary Moments Award" },
  { id: "MLBPCPOY", label: "Players Choice Player of the Year" },
  { id: "MLBPCMOY", label: "Players Choice Man of the Year" },
  { id: "MLBPCALOP", label: "Players Choice AL Outstanding Player" },
  { id: "MLBPCNLOP", label: "Players Choice NL Outstanding Player" },
  { id: "MLBPCALPIT", label: "Players Choice AL Outstanding Pitcher" },
  { id: "MLBPCNLPIT", label: "Players Choice NL Outstanding Pitcher" },
  { id: "MLBPCALOR", label: "Players Choice AL Outstanding Rookie" },
  { id: "MLBPCNLOR", label: "Players Choice NL Outstanding Rookie" },
  { id: "MLBPCALCOM", label: "Players Choice AL Comeback Player" },
  { id: "MLBPCNLCOM", label: "Players Choice NL Comeback Player" },
  { id: "BAMLPOY", label: "Baseball America Player of the Year" },
  { id: "BAMLROY", label: "Baseball America Rookie of the Year" },
  { id: "BAMLMOY", label: "Baseball America Manager of the Year" },
  { id: "SISPORTSMAN", label: "SI Sportsman of the Year" },
  { id: "APATHLETE", label: "AP Male Athlete of the Year" },
  { id: "MLBHOF", label: "Hall of Fame" },
  { id: "WSCHAMP", label: "World Series Championship" },
  { id: "WSCHAMPMGR", label: "World Series Champion Manager" },
  { id: "ALAS", label: "AL All-Star" },
  { id: "NLAS", label: "NL All-Star" },
  { id: "HRDERBYWIN", label: "Home Run Derby Winner" },
];

export const AWARD_PAGE_LABEL: Record<string, string> = Object.fromEntries(
  AWARD_PAGES.map((a) => [a.id, a.label]),
);
