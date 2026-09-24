/* Team pages: club stats, the one-team views, team leaders, and splits counted off a club's game log. */
import {
  DIVISION_ORDER,
  DIVISIONS,
  LEAGUES,
  mlb,
  MONTHS,
  seasonOf,
  todayPT,
} from "./core";
import {
  inRotation,
  type TeamStatCol,
  teamStatNum,
  type TeamStatValue,
  WAR_COL,
} from "./stats";
import {
  type Game,
  SCHEDULE_HYDRATE,
  toGame,
} from "./schedule";
import {
  type GameType,
  getStandings,
  type StandingRow,
} from "./standings";
import {
  getTeamPlayerStats,
  PLAYER_FIELDING_COLS,
  type PlayerGameType,
  type PlayerStatRow,
  type StatGroup,
} from "./players";
import {
  divisionsOf,
  SABER_FORMAT,
  sumStatLines,
} from "./career";


export interface TeamStatRow {
  id: number;
  name: string;
  values: Record<string, TeamStatValue>;
}

export interface TeamStatTable {
  group: "hitting" | "pitching";
  columns: TeamStatCol[];
  rows: TeamStatRow[];
}

/* Column order for the team tables — also the order the team page lists a
 * single club's line in, so the two views stay in step. */
export const TEAM_HITTING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games played" },
  { key: "runs", label: "R", title: "Runs scored" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "doubles", label: "2B", title: "Doubles" },
  { key: "triples", label: "3B", title: "Triples" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "K", title: "Strikeouts" },
  { key: "stolenBases", label: "SB", title: "Stolen bases" },
  { key: "avg", label: "AVG", title: "Batting average — hits per at-bat" },
  {
    key: "obp",
    label: "OBP",
    title: "On-base percentage — how often a batter reaches base",
  },
  {
    key: "slg",
    label: "SLG",
    title: "Slugging percentage — total bases per at-bat",
  },
  { key: "ops", label: "OPS", title: "On-base plus slugging (OBP + SLG)" },
];

export const TEAM_PITCHING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games played" },
  { key: "wins", label: "W", title: "Wins" },
  { key: "losses", label: "L", title: "Losses" },
  {
    key: "era",
    label: "ERA",
    title: "Earned run average — earned runs allowed per nine innings",
  },
  {
    key: "whip",
    label: "WHIP",
    title: "Walks and hits allowed per inning pitched",
  },
  { key: "inningsPitched", label: "IP", title: "Innings pitched" },
  { key: "hits", label: "H", title: "Hits allowed" },
  { key: "runs", label: "R", title: "Runs allowed" },
  { key: "earnedRuns", label: "ER", title: "Earned runs allowed" },
  { key: "homeRuns", label: "HR", title: "Home runs allowed" },
  { key: "baseOnBalls", label: "BB", title: "Walks issued" },
  { key: "strikeOuts", label: "K", title: "Strikeouts recorded" },
  { key: "saves", label: "SV", title: "Saves" },
  { key: "shutouts", label: "SHO", title: "Shutouts" },
  {
    key: "avg",
    label: "OAVG",
    title: "Opponent batting average against this staff",
  },
  {
    key: "strikeoutsPer9Inn",
    label: "K/9",
    title: "Strikeouts per nine innings pitched",
  },
];

/** Display form of a stat cell — "—" for anything the API didn't report. */
export const teamStatText = (v: TeamStatValue): string =>
  v === null || v === undefined
    ? "—"
    : typeof v === "number"
      ? v.toLocaleString()
      : v;

/* A club's columns for a group. Fielding is reported with the same handful of
   figures for a club as for a player, so it reads the player set. */
export const cols = (group: StatGroup): TeamStatCol[] =>
  group === "hitting"
    ? TEAM_HITTING_COLS
    : group === "pitching"
      ? TEAM_PITCHING_COLS
      : PLAYER_FIELDING_COLS;

/**
 * Every player's WAR for one season, and each club's — the sum of the WAR its
 * players earned there.
 *
 * One request per group, cached for the day: MLB's sabermetrics feed answers
 * for the whole league at once, so the alternative — a request per row —
 * isn't one. `playerPool=All` because this is joined onto tables that have
 * already decided who qualifies; the feed's own qualified pool would blank
 * the WAR of anyone those tables let through.
 *
 * A traded player gets one line carrying the club he finished at, so summing
 * by club double-counts nobody. Spring and October have no published WAR at
 * all and come back empty, which reads as a blank column rather than a zero.
 */
export async function seasonWar(
  season: number,
  group: StatGroup,
  gameType: string = "R",
): Promise<{ player: Map<number, number>; team: Map<number, number> }> {
  const player = new Map<number, number>();
  const team = new Map<number, number>();
  if (group === "fielding") return { player, team };

  const data = await mlb(
    `/stats?stats=sabermetrics&group=${group}&season=${season}&sportId=1` +
      `&gameType=${gameType}&playerPool=All&limit=2000`,
    86400,
  ).catch(() => null);

  for (const split of (data?.stats?.[0]?.splits ?? []) as any[]) {
    const war = teamStatNum(split.stat?.war);
    if (war === null) continue;
    if (typeof split.player?.id === "number") player.set(split.player.id, war);
    if (typeof split.team?.id === "number")
      team.set(split.team.id, (team.get(split.team.id) ?? 0) + war);
  }
  return { player, team };
}

/**
 * Quality starts for the whole league, keyed by player. One read of the
 * advanced line, cached for the day like the sabermetrics one — the standard
 * season feed has no such column and won't sort by it either.
 */
interface QsLine {
  id: number;
  name: string;
  team: string;
  qs: number;
}

export async function seasonQualityStarts(
  season: number,
  gameType: string = "R",
): Promise<QsLine[]> {
  const data = await mlb(
    `/stats?stats=seasonAdvanced&group=pitching&season=${season}&sportId=1` +
      `&gameType=${gameType}&playerPool=All&limit=2000`,
    86400,
  ).catch(() => null);

  return ((data?.stats?.[0]?.splits ?? []) as any[]).flatMap(
    (split): QsLine[] => {
      const qs = teamStatNum(split.stat?.qualityStarts);
      return qs === null || typeof split.player?.id !== "number"
        ? []
        : [
            {
              id: split.player.id,
              name: split.player.fullName ?? "—",
              team: split.team?.name ?? "",
              qs,
            },
          ];
    },
  );
}

/** WAR as a table prints it, or blank where the feed has no line. */
export const warText = (war: number | undefined): TeamStatValue =>
  war === undefined ? null : SABER_FORMAT.war(war);

async function teamStatTable(
  group: "hitting" | "pitching",
  season: number,
  gameType: GameType,
  sportId: number,
): Promise<TeamStatTable> {
  const [data, war] = await Promise.all([
    mlb(
      `/teams/stats?season=${season}&sportIds=${sportId}&group=${group}&stats=season&gameType=${gameType}`,
      1800,
    ),
    /* The sabermetrics feed is a major-league one: asking it for a minor
       league answers with major-league clubs, whose ids would land WAR on
       whatever affiliate happened to share one. */
    sportId === 1
      ? seasonWar(season, group, gameType)
      : { team: new Map<number, number>(), player: new Map<number, number>() },
  ]);
  const splits = (data.stats?.[0]?.splits ?? []) as any[];
  const standard = cols(group);
  /* Sortable here, unlike on the player board: this table does its own
     ordering in the browser, over rows it already holds. */
  const columns = [WAR_COL, ...standard];
  return {
    group,
    columns,
    rows: splits.map((s): TeamStatRow => {
      const stat = s.stat ?? {};
      return {
        id: s.team?.id,
        name: s.team?.name ?? "—",
        values: {
          ...Object.fromEntries(standard.map((c) => [c.key, stat[c.key] ?? null])),
          war: warText(war.team.get(s.team?.id)),
        },
      };
    }),
  };
}

/**
 * Season hitting and pitching lines for all 30 clubs — the TEAM STATISTICS
 * section, and the source the team page pulls its own club's line from, so
 * both read the same cached pair of requests.
 */
export async function getTeamStats(
  season: number,
  gameType: GameType = "R",
  /** The level, as StatsAPI numbers it — 1 for the majors, 11 for Triple-A. */
  sportId = 1,
): Promise<TeamStatTable[]> {
  return Promise.all([
    teamStatTable("hitting", season, gameType, sportId),
    teamStatTable("pitching", season, gameType, sportId),
  ]);
}

/* ── One team ───────────────────────────────────────────────────────── */

export interface RosterEntry {
  id: number;
  name: string;
  number: string;
  pos: string;
  /** "Pitcher" / "Infielder" / … — the page groups the roster by this. */
  posType: string;
  status: string;
  /** "A", "D10", "ILF" … — what the injuries tab filters on. */
  statusCode: string;
  /** Which hand they throw and hit with — "L", "R", "S" for a switch-hitter. */
  throws: string;
  bats: string;
  age: number | null;
  /** As MLB reports them: `5' 10"` and pounds. */
  height: string;
  weight: number | null;
}

export interface TeamIdentity {
  id: number;
  name: string;
  abbr: string;
  league: string;
  division: string;
  venue: string;
  firstYear: string;
}

/*
 * The team page loads in four independent pieces rather than one bundle, so
 * each panel streams in behind its own skeleton instead of the whole page
 * waiting on the slowest request. Identity is deliberately the only one the
 * route awaits directly: it is a single cheap request, and resolving it
 * before anything is flushed is what lets an unknown id answer a real 404
 * instead of a 200 with a not-found body.
 */

/** Identity and ballpark. Null for an unknown id so the route can 404. */
export async function getTeamIdentity(
  id: number,
  season: number,
): Promise<TeamIdentity | null> {
  const data = await mlb(`/teams/${id}?season=${season}`, 1800).catch(
    (e: Error) => {
      if (e.message.includes(" 404:")) return null;
      throw e;
    },
  );
  const t = data?.teams?.[0];
  if (!t) return null;
  return {
    id: t.id,
    name: t.name ?? "—",
    abbr: t.abbreviation ?? "—",
    league: LEAGUES[t.league?.id] ?? t.league?.name ?? "",
    division: DIVISIONS[t.division?.id] ?? t.division?.name ?? "",
    venue: t.venue?.name ?? "",
    firstYear: t.firstYearOfPlay ?? "",
  };
}

/**
 * One club's standings line, off the same league-wide payload the standings
 * section fetched. Null when it has no line for this season yet.
 */
export async function getTeamRecord(
  id: number,
  season: number,
): Promise<StandingRow | null> {
  const divisions = await getStandings(season);
  return divisions.flatMap((d) => d.teams).find((r) => r.id === id) ?? null;
}

/** One club's season lines, off the same payload the team-stats section uses. */
export async function getTeamLines(
  id: number,
  season: number,
): Promise<{ hitting: TeamStatRow | null; pitching: TeamStatRow | null }> {
  const stats = await getTeamStats(season);
  const lineFor = (group: "hitting" | "pitching") =>
    stats.find((s) => s.group === group)?.rows.find((r) => r.id === id) ?? null;
  return { hitting: lineFor("hitting"), pitching: lineFor("pitching") };
}

/** One club's roster. Degrades to an empty list — the rest of the page stands. */
export async function getTeamRoster(
  id: number,
  season: number,
  rosterType = "fullSeason",
): Promise<RosterEntry[]> {
  const data = await mlb(
    `/teams/${id}/roster?season=${season}&rosterType=${rosterType}&hydrate=person`,
    1800,
  ).catch(() => null);
  return ((data?.roster ?? []) as any[]).map((r): RosterEntry => {
    const p = r.person ?? {};
    return {
      id: p.id,
      name: p.fullName ?? "—",
      number: r.jerseyNumber ?? p.primaryNumber ?? "",
      pos: r.position?.abbreviation ?? "",
      posType: r.position?.type ?? "Other",
      status: r.status?.description ?? "",
      statusCode: r.status?.code ?? "",
      throws: p.pitchHand?.code ?? "—",
      bats: p.batSide?.code ?? "—",
      age: typeof p.currentAge === "number" ? p.currentAge : null,
      height: p.height ?? "—",
      weight: typeof p.weight === "number" ? p.weight : null,
    };
  });
}

/* ── Team page: schedule, leaders, ranks, splits, transactions ──────── */

/**
 * One game per gamePk, the latest date it was played on.
 *
 * A rained-out game keeps its gamePk: the season schedule lists it once as
 * "Postponed" on the night it wasn't played and again on the makeup date, and
 * a suspended game lists both halves the same way. Both entries are the same
 * game, so the played one wins — which is also what keeps React from seeing
 * two rows with one key.
 */
export function latestByGame(games: Game[]): Game[] {
  const latest = new Map<number, Game>();
  for (const g of games) {
    const prev = latest.get(g.pk);
    if (!prev || g.startTime > prev.startTime) latest.set(g.pk, g);
  }
  return [...latest.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
}

/**
 * One club's season, every game of it — the schedule tab, and the source the
 * home tab slices its last few finals off. Post-season game types ride along
 * so October doesn't vanish from a past season's page.
 */
export async function getTeamSchedule(
  id: number,
  season: number,
  /** Narrowed to "R" where October would only muddy a count. */
  gameTypes: string = "R,F,D,L,W",
): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&teamId=${id}&season=${season}&gameType=${gameTypes}&hydrate=${SCHEDULE_HYDRATE}`,
    300,
  );
  return latestByGame(
    ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? []).map(toGame),
  );
}

/* ── Team leaders ───────────────────────────────────────────────────── */

/** One club's leader board for a stat — the top few names, not the league's. */
export interface TeamLeaderBoard {
  key: string;
  label: string;
  group: StatGroup;
  leaders: { id: number; name: string; value: string }[];
}

/*
 * The six a club is read by, and what it takes to appear on one. Counting
 * stats need no bar; a rate does, or a September call-up with one good week
 * leads the club in batting average. The bar is MLB's own qualification —
 * 3.1 plate appearances and one inning per team game.
 */
export interface TeamLeaderSpec {
  key: string;
  label: string;
  group: StatGroup;
  /** Lower is better — ERA, not home runs. */
  low?: boolean;
  /** Minimum of `key` per team game to qualify. */
  min?: { key: string; perGame: number };
}

const TEAM_LEADER_SPECS: TeamLeaderSpec[] = [
  {
    key: "avg",
    label: "AVG",
    group: "hitting",
    min: { key: "plateAppearances", perGame: 3.1 },
  },
  { key: "homeRuns", label: "HOME RUNS", group: "hitting" },
  { key: "rbi", label: "RBI", group: "hitting" },
  {
    key: "era",
    label: "ERA",
    group: "pitching",
    low: true,
    min: { key: "inningsPitched", perGame: 1 },
  },
  { key: "strikeOuts", label: "STRIKEOUTS", group: "pitching" },
  { key: "saves", label: "SAVES", group: "pitching" },
];

/*
 * The five a club's own stats tab leads each table with — the same ranking as
 * the home tab's boards, one name deep, over the rows the table already
 * carries. Rates keep a qualifying bar for the same reason: a callup with one
 * good week is not the club's leader in average.
 */
export const PLAYER_LEADER_SPECS: Record<StatGroup, TeamLeaderSpec[]> = {
  hitting: [
    {
      key: "avg",
      label: "BATTING AVG",
      group: "hitting",
      min: { key: "plateAppearances", perGame: 3.1 },
    },
    { key: "homeRuns", label: "HOME RUNS", group: "hitting" },
    { key: "rbi", label: "RBI", group: "hitting" },
    {
      key: "obp",
      label: "OBP",
      group: "hitting",
      min: { key: "plateAppearances", perGame: 3.1 },
    },
    { key: "hits", label: "HITS", group: "hitting" },
  ],
  pitching: [
    {
      key: "era",
      label: "ERA",
      group: "pitching",
      low: true,
      min: { key: "inningsPitched", perGame: 1 },
    },
    { key: "wins", label: "WINS", group: "pitching" },
    { key: "strikeOuts", label: "STRIKEOUTS", group: "pitching" },
    { key: "saves", label: "SAVES", group: "pitching" },
    {
      key: "whip",
      label: "WHIP",
      group: "pitching",
      low: true,
      min: { key: "inningsPitched", perGame: 1 },
    },
  ],
  fielding: [
    {
      key: "fielding",
      label: "FIELDING PCT",
      group: "fielding",
      min: { key: "chances", perGame: 1 },
    },
    { key: "putOuts", label: "PUTOUTS", group: "fielding" },
    { key: "assists", label: "ASSISTS", group: "fielding" },
    { key: "doublePlays", label: "DOUBLE PLAYS", group: "fielding" },
    { key: "chances", label: "TOTAL CHANCES", group: "fielding" },
  ],
};

/** How many names each board shows. */
export const TEAM_LEADER_COUNT = 3;

/*
 * Fractions of the qualifying bar to try, in order. A club whose rotation
 * spent the summer hurt can have fewer than three qualified pitchers — MLB's
 * own leader endpoint then answers with one name — so the bar comes down a
 * step at a time until the board fills, rather than the board being short.
 * The last step is no bar at all, which only a club with barely three
 * pitchers all season ever reaches.
 */
const BAR_STEPS = [1, 0.5, 0.25, 0];

/** Best first, by this spec's direction; unreported figures never rank. */
function rankBy(rows: PlayerStatRow[], spec: TeamLeaderSpec): PlayerStatRow[] {
  return rows
    .filter((r) => teamStatNum(r.values[spec.key]) !== null)
    .sort((a, b) => {
      const va = teamStatNum(a.values[spec.key])!;
      const vb = teamStatNum(b.values[spec.key])!;
      return spec.low ? va - vb : vb - va;
    });
}

export function leaderBoard(
  spec: TeamLeaderSpec,
  rows: PlayerStatRow[],
  teamGames: number,
): TeamLeaderBoard {
  const ranked = rankBy(rows, spec);
  const bar = spec.min
    ? (fraction: number) =>
        ranked.filter(
          (r) =>
            (teamStatNum(r.values[spec.min!.key]) ?? 0) >=
            teamGames * spec.min!.perGame * fraction,
        )
    : () => ranked;
  const filled =
    BAR_STEPS.map(bar).find((list) => list.length >= TEAM_LEADER_COUNT) ??
    ranked;

  return {
    key: `${spec.group}.${spec.key}`,
    label: spec.label,
    group: spec.group,
    leaders: filled.slice(0, TEAM_LEADER_COUNT).map((r) => ({
      id: r.id,
      name: r.name,
      value: teamStatText(r.values[spec.key]),
    })),
  };
}

/**
 * The club's own leaders, ranked here rather than read off MLB's team-leader
 * endpoint: that one answers only with qualified players, which leaves a
 * board of one or two names where three were asked for.
 */
export async function getTeamLeaders(
  id: number,
  season: number,
  gameType: PlayerGameType = "R",
  /** Leave off anyone the club has since moved on from — traded, released —
   *  while keeping the ones on the injured list, who are still its players. */
  activeOnly = false,
): Promise<TeamLeaderBoard[]> {
  const [hitting, pitching, active] = await Promise.all([
    getTeamPlayerStats(id, season, "hitting", gameType),
    getTeamPlayerStats(id, season, "pitching", gameType),
    activeOnly ? getTeamRoster(id, season, "40Man") : [],
  ]);
  const onRoster = activeOnly ? new Set(active.map((r) => r.id)) : null;
  const rostered = (rows: PlayerStatRow[]) =>
    onRoster ? rows.filter((r) => onRoster.has(r.id)) : rows;
  /* Games the club has played, as its busiest position player has seen them —
     the denominator every qualifying bar is a multiple of. */
  const teamGames = Math.max(
    0,
    ...hitting.map((r) => teamStatNum(r.values.gamesPlayed) ?? 0),
  );

  return TEAM_LEADER_SPECS.map((spec) =>
    leaderBoard(
      spec,
      rostered(spec.group === "hitting" ? hitting : pitching),
      teamGames,
    ),
  );
}

/** A team stat with where it places among the thirty clubs. */
export interface RankedStat {
  key: string;
  label: string;
  value: TeamStatValue;
  /** 1 is best in the majors; null when the club has no figure yet. */
  rank: number | null;
}

/* The four each group leads with on the home tab, and which direction is
 * good — a low ERA is first, a low run total is last. */
export const TEAM_CARD_STATS: Record<
  "hitting" | "pitching",
  { key: string; label: string; low?: boolean }[]
> = {
  hitting: [
    { key: "runs", label: "RUNS" },
    { key: "avg", label: "BATTING AVERAGE" },
    { key: "obp", label: "ON BASE PERCENTAGE" },
    { key: "slg", label: "SLUGGING PERCENTAGE" },
  ],
  pitching: [
    { key: "era", label: "ERA", low: true },
    { key: "whip", label: "WHIP", low: true },
    { key: "strikeOuts", label: "STRIKEOUTS" },
    { key: "avg", label: "OPP AVG", low: true },
  ],
};

/**
 * Where one club places in a stat, counting how many clubs beat it — ties
 * share a rank (two firsts, then a third) and unreported figures are skipped
 * rather than counted as zero, which would rank a silent club above a bad one.
 */
export function statRank(
  rows: TeamStatRow[],
  key: string,
  id: number,
  low = false,
): number | null {
  const mine = teamStatNum(rows.find((r) => r.id === id)?.values[key] ?? null);
  if (mine === null) return null;
  const ahead = rows.filter((r) => {
    const v = teamStatNum(r.values[key]);
    return v !== null && (low ? v < mine : v > mine);
  }).length;
  return ahead + 1;
}

/**
 * The home tab's stat card: the club's headline figures with their MLB rank,
 * off the same league-wide payload the team-stats section already cached.
 */
export async function getTeamCardStats(
  id: number,
  season: number,
): Promise<Record<"hitting" | "pitching", RankedStat[]>> {
  const tables = await getTeamStats(season);
  const build = (group: "hitting" | "pitching"): RankedStat[] => {
    const rows = tables.find((t) => t.group === group)?.rows ?? [];
    const mine = rows.find((r) => r.id === id);
    return TEAM_CARD_STATS[group].map((s) => ({
      key: s.key,
      label: s.label,
      value: mine?.values[s.key] ?? null,
      rank: statRank(rows, s.key, id, s.low),
    }));
  };
  return { hitting: build("hitting"), pitching: build("pitching") };
}

/** One situational line — home, away, versus left, versus right. */
export interface SplitLine {
  code: string;
  label: string;
  values: Record<string, TeamStatValue>;
}

/** A block of related splits, read as one section of the table. */
export interface SplitSection {
  label: string;
  lines: SplitLine[];
}

/*
 * The sections a splits page is read in, in MLB's own order. Codes come from
 * /situationCodes; only the team-level ones are here, and the two sections
 * that only mean something for a batting order are hitting-only.
 */
export const SPLIT_SECTIONS: {
  label: string;
  codes: string[];
  hittingOnly?: boolean;
}[] = [
  { label: "Game", codes: ["h", "a", "d", "n", "g", "t"] },
  { label: "Month", codes: ["3", "4", "5", "6", "7", "8", "9", "10"] },
  { label: "Half", codes: ["preas", "posas"] },
  /* The hand a club hit or pitched against is not who it played, so it reads
     as its own block rather than the head of the opponent one. */
  { label: "Handedness", codes: ["vl", "vr"] },
  { label: "Opponent", codes: ["val", "vnl", "int"] },
  { label: "Bases", codes: ["r0", "ron", "risp", "risp2", "r123", "lo"] },
  { label: "Score", codes: ["sah", "sti", "sbh", "lc"] },
  { label: "Result", codes: ["twn", "tls", "taw", "tal"] },
  /* Every inning, not the four MLB's own page stops at: the shape of a
     bullpen is in the seventh against the sixth, and of an offence in the
     first. Extras ride on the end. */
  {
    label: "Inning",
    codes: [
      "i01",
      "i02",
      "i03",
      "i04",
      "i05",
      "i06",
      "i07",
      "i08",
      "i09",
      "ix",
    ],
  },
  { label: "Count", codes: ["fp", "ac", "ec", "bc", "2s", "fc"] },
  {
    label: "Batting Order",
    hittingOnly: true,
    codes: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"],
  },
  {
    label: "Position",
    hittingOnly: true,
    codes: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "pD", "pH"],
  },
];

/**
 * Every section of one club's splits. `stats=season` rides along in the same
 * request so the season total heads the first block — a split only means
 * something against the line it is a slice of.
 */
/**
 * Every section of one splits payload, whether a club's or a player's. The
 * caller hands over the URL for a given set of situation codes, since teams
 * and people answer on different endpoints but in exactly the same shape.
 * `stats=season` rides along in that request so the season total heads the
 * first block — a split only means something against the line it is a slice of.
 */
export async function buildSplits(
  url: (codes: string) => string,
  columns: TeamStatCol[],
  sections: { label: string; codes: string[] }[],
): Promise<SplitSection[]> {
  const data = await mlb(url(sections.flatMap((s) => s.codes).join(",")), 1800);
  const values = (stat: any) =>
    Object.fromEntries(columns.map((c) => [c.key, stat?.[c.key] ?? null]));
  const typed = (name: string) =>
    ((data.stats ?? []) as any[]).find((s) => s.type?.displayName === name)
      ?.splits ?? [];

  const byCode = new Map<string, SplitLine>();
  for (const s of [
    ...typed("statSplits"),
    ...typed("careerStatSplits"),
  ] as any[]) {
    const code = s.split?.code ?? "";
    /* One code, one line: a club that changed leagues mid-season — or a
       player traded across one — can come back with the same code twice, and
       the first is the one on record. */
    if (code && !byCode.has(code))
      byCode.set(code, {
        code,
        /* MLB's own casing — "Home Games", "vs. AL", "September". The tables
           set in capitals uppercase it themselves; the overview reads it as
           MLB writes it. */
        label: s.split?.description ?? "—",
        values: values(s.stat),
      });
  }

  const built = sections
    .map((sec) => ({
      label: sec.label,
      lines: sec.codes
        .map((c) => byCode.get(c))
        .filter((l): l is SplitLine => l !== undefined),
    }))
    .filter((sec) => sec.lines.length > 0);

  /* The line the slices are read against — a season's, or a career's on the
     career view, which answers under its own type name. */
  const total = ((typed("season") as any[])[0] ??
    (typed("career") as any[])[0]) as any;
  if (total && built.length > 0)
    built[0].lines.unshift({
      code: "total",
      label: "Total",
      values: values(total.stat),
    });
  return built;
}

export async function getTeamSplits(
  id: number,
  season: number,
  group: StatGroup,
): Promise<SplitSection[]> {
  const [situational, logged] = await Promise.all([
    /* MLB answers no situation code at all for a fielding line, so that group
       is read entirely off the game log below. */
    group === "fielding"
      ? Promise.resolve<SplitSection[]>([])
      : buildSplits(
          (codes) =>
            `/teams/${id}/stats?season=${season}&group=${group}&stats=season,statSplits&sitCodes=${codes}`,
          cols(group),
          SPLIT_SECTIONS.filter((s) => !s.hittingOnly || group === "hitting"),
        ),
    /* A club whose log the feed won't answer for still gets the situational
       half of its page rather than an unavailable tab. */
    getTeamLogSplits(id, season, group).catch(() => [] as SplitSection[]),
  ]);
  /* A block the log and the situation codes both answer — the opponents — is
     one section read twice, not two: MLB's league lines head it and the
     division lines counted off the games follow them. */
  const built = [...situational];
  for (const sec of logged) {
    const at = built.find((s) => s.label === sec.label);
    if (at) at.lines = [...at.lines, ...sec.lines];
    else built.push(sec);
  }
  return built;
}

/* ── Splits counted off the club's game log ─────────────────────────── */

/** One game of a club's log, cut down to what a split is grouped by. */
export interface TeamLogGame {
  pk: number;
  date: string;
  isHome: boolean;
  opponent: number;
  values: Record<string, TeamStatValue>;
}

/** What the schedule knows about a game that its stat line doesn't — the park
    it was played in, and whether it was a night game, which the game log
    reports as "day" for all 162. */
export interface TeamLogGameInfo {
  park: string;
  night: boolean;
}

/** "AL East" — MLB's own name for a division, set the way a split line is
    rather than in the capitals the standings are read in. */
export const divisionName = (id: number): string =>
  (DIVISIONS[id] ?? "").replace(
    /\s(\w+)$/,
    (_, w: string) => ` ${w[0]}${w.slice(1).toLowerCase()}`,
  );

/* The recent windows, in the order they narrow. MLB publishes d7 and d30
   situation codes and has stopped answering them, and has never had a 14 or a
   365, so all four are counted off the games themselves. */
const RECENT_WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: "Last 7 Days" },
  { days: 14, label: "Last 14 Days" },
  { days: 30, label: "Last 30 Days" },
  { days: 365, label: "Last 365 Days" },
];

/**
 * The sections a game log answers that the situation codes don't: recent
 * form, the clubs played and the parks played in — and, for a fielding line,
 * every section there is.
 *
 * `prior` is the season before, which only the 365-day window reads: a year
 * back from any date in a season reaches into the one before it.
 */
export function teamLogSections(
  group: StatGroup,
  games: TeamLogGame[],
  prior: TeamLogGame[],
  /** The day the windows count back from — today, or the season's last game. */
  anchor: string,
  /** The park each game was played in and whether it was at night, by gamePk. */
  info: Map<number, TeamLogGameInfo>,
  /** Which division each club played in that season, by club id. */
  division: Map<number, number>,
): SplitSection[] {
  if (games.length === 0) return [];
  const line = (code: string, label: string, rows: TeamLogGame[]) =>
    rows.length === 0
      ? null
      : {
          code,
          label,
          values: sumStatLines(
            group,
            rows.map((r) => r.values),
          ),
        };
  const kept = (lines: (SplitLine | null)[]) =>
    lines.filter((l): l is SplitLine => l !== null);

  /* One line per club, park or month, alphabetical — MLB's own order on both
     tables. A game the schedule can't name is left out rather than filed
     under a blank heading. */
  const binned = (
    label: string,
    rows: TeamLogGame[],
    name: (g: TeamLogGame) => string,
  ) => {
    const bins = new Map<string, TeamLogGame[]>();
    for (const g of rows) {
      const k = name(g);
      if (!k) continue;
      const bin = bins.get(k);
      if (bin) bin.push(g);
      else bins.set(k, [g]);
    }
    return {
      label,
      lines: kept(
        [...bins.keys()].sort().map((k) => line(k, k, bins.get(k)!)),
      ),
    };
  };

  const since = (days: number) =>
    new Date(Date.parse(anchor) - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
  const back = [...prior, ...games];
  const sections: SplitSection[] = [];

  /* Fielding has no situational payload to head the page, so its own GAME and
     MONTH blocks — and the season line above them — come from the log. */
  if (group === "fielding") {
    sections.push({
      label: "Game",
      lines: kept([
        line("total", "Total", games),
        line("h", "Home Games", games.filter((g) => g.isHome)),
        line("a", "Away Games", games.filter((g) => !g.isHome)),
        line("d", "Day Games", games.filter((g) => !info.get(g.pk)?.night)),
        line("n", "Night Games", games.filter((g) => info.get(g.pk)?.night)),
      ]),
    });
    /* Months read in the order they were played, not alphabetically — the
       one section a sort by name gets wrong. */
    sections.push({
      label: "Month",
      lines: kept(
        MONTHS.map((m, i) =>
          line(
            `m${i + 1}`,
            /* The months are held in capitals for the game log's bands; a
               split reads them the way every other line on the page is set. */
            m.charAt(0) + m.slice(1).toLowerCase(),
            games.filter((g) => Number(g.date.slice(5, 7)) === i + 1),
          ),
        ),
      ),
    });
  }

  sections.push({
    label: "Recent",
    lines: kept(
      RECENT_WINDOWS.map((w) =>
        line(
          `d${w.days}`,
          w.label,
          back.filter((g) => g.date >= since(w.days) && g.date <= anchor),
        ),
      ),
    ),
  });
  /* Who was played, added up by division — six lines under MLB's two league
     ones, in the order every scoreboard reads them. Thirty club lines would be
     a list rather than a split, and a season played before the divisions
     existed simply has none of them. */
  sections.push({
    label: "Opponent",
    lines: kept(
      DIVISION_ORDER.map((d) =>
        line(
          `div${d}`,
          `vs. ${divisionName(d)}`,
          games.filter((g) => division.get(g.opponent) === d),
        ),
      ),
    ),
  });
  sections.push(binned("Ballpark", games, (g) => info.get(g.pk)?.park ?? ""));
  return sections.filter((s) => s.lines.length > 0);
}

/** One club's season, a line per game, in the shape the sections group by. */
async function teamGameLog(
  id: number,
  season: number,
  group: StatGroup,
): Promise<TeamLogGame[]> {
  const data = await mlb(
    `/teams/${id}/stats?season=${season}&group=${group}&stats=gameLog`,
    1800,
  );
  return ((data.stats?.[0]?.splits ?? []) as any[]).map((s) => ({
    pk: s.game?.gamePk ?? 0,
    date: s.date ?? "",
    isHome: !!s.isHome,
    opponent: s.opponent?.id ?? 0,
    values: (s.stat ?? {}) as Record<string, TeamStatValue>,
  }));
}

/**
 * The log-counted half of a club's splits. Four requests, all cached: the
 * season's log, the season before it for the 365-day window, and the schedule,
 * which is the only thing that names the park a game was played in — an away
 * game is not always at the other club's own yard — and the only one that
 * knows a night game from a day one, and the division each club played in
 * that season, which is what the opponents are added up by.
 */
async function getTeamLogSplits(
  id: number,
  season: number,
  group: StatGroup,
): Promise<SplitSection[]> {
  const [games, prior, schedule, division] = await Promise.all([
    teamGameLog(id, season, group),
    teamGameLog(id, season - 1, group).catch(() => [] as TeamLogGame[]),
    getTeamSchedule(id, season).catch(() => [] as Game[]),
    divisionsOf(season),
  ]);
  const info = new Map(
    schedule.map((g) => [g.pk, { park: g.venue, night: g.night }] as const),
  );

  /* A season being played counts back from today; a finished one from its own
     last game, where "last 30 days" means the thirty it ended on. */
  const anchor =
    season === seasonOf(todayPT())
      ? todayPT()
      : (games[games.length - 1]?.date ?? todayPT());
  return teamLogSections(group, games, prior, anchor, info, division);
}

/** One roster move — the transactions tab, newest first. */
export interface Transaction {
  id: number;
  date: string;
  type: string;
  description: string;
  personId: number | null;
  person: string;
}

export async function getTeamTransactions(
  id: number,
  season: number,
): Promise<Transaction[]> {
  const data = await mlb(
    `/transactions?teamId=${id}&startDate=${season}-01-01&endDate=${season}-12-31`,
    3600,
  );
  return ((data.transactions ?? []) as any[])
    .map(
      (t): Transaction => ({
        id: t.id,
        date: t.date ?? "",
        type: t.typeDesc ?? "",
        description: t.description ?? "",
        personId: t.person?.id ?? null,
        person: t.person?.fullName ?? "",
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Everyone a trade moved this season, in the club's own log order. The stats
 * tables mark these names, because half a season's line for a club is not the
 * same figure as a whole one — MLB files a trade once per player it moved, so
 * the row already names the person and the sentence already says which way.
 */
export interface TradedPlayer {
  id: number;
  name: string;
  /** The club's own sentence for the move, which says which way it went. */
  note: string;
}

export function tradedPlayers(moves: Transaction[]): TradedPlayer[] {
  const seen = new Map<number, TradedPlayer>();
  for (const t of moves)
    if (t.personId && /trade/i.test(t.type) && !seen.has(t.personId))
      seen.set(t.personId, {
        id: t.personId,
        name: t.person,
        note: t.description || t.type,
      });
  return [...seen.values()];
}

/** A day's moves, in the order the club made them. */
export interface TransactionDay {
  date: string;
  notes: string[];
}

/** One month of a season's moves — "2026-08" and the days under it. */
export interface TransactionMonth {
  key: string;
  days: TransactionDay[];
}

/**
 * A season's moves as the club's own log reads: months, then days, then what
 * was done that day in one piece.
 *
 * A trade is filed once per player it moved, each row carrying the same
 * sentence, so identical wording within a day is written once.
 */
export function transactionMonths(moves: Transaction[]): TransactionMonth[] {
  const months: TransactionMonth[] = [];
  for (const t of moves) {
    const key = t.date.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.key !== key) months.push((m = { key, days: [] }));
    let d = m.days[m.days.length - 1];
    if (!d || d.date !== t.date) m.days.push((d = { date: t.date, notes: [] }));
    if (t.description && !d.notes.includes(t.description))
      d.notes.push(t.description);
  }
  return months;
}

/* Injured-list codes all start with D (day counts) or IL (full season) —
 * everything else on the 40-man is an option, a reassignment or a DFA. */
const injured = (status: string) => /^(D\d|IL)/.test(status);

/**
 * The active roster, grouped the way a club lists itself: the rotation, then
 * the bullpen, then round the diamond. Only pitchers need their season line to
 * be placed — everyone else is grouped by the position they play.
 */
export interface RosterGroup {
  label: string;
  players: RosterEntry[];
}

/* Position types in the order a roster page reads, pitchers already split. */
const GROUP_ORDER = ["Catcher", "Infielder", "Outfielder", "Hitter"];
const GROUP_LABEL: Record<string, string> = {
  Catcher: "CATCHERS",
  Infielder: "INFIELDERS",
  Outfielder: "OUTFIELDERS",
  Hitter: "DESIGNATED HITTERS",
};

/**
 * The club as it stands today: who is on the active roster, in groups.
 *
 * Starter or reliever is not something the roster payload says — every arm is
 * position "P" — so it is read off the season line: a pitcher who started at
 * least half his appearances is in the rotation. Nobody with no line yet (a
 * call-up on his first day) has started a game, which puts him in the bullpen,
 * where a fresh arm in fact is. The same reading gives each arm the position
 * he is actually listed by, "SP" or "RP" rather than the payload's flat "P".
 */
export async function getTeamRosterGroups(
  id: number,
  season: number,
): Promise<RosterGroup[]> {
  const [roster, pitching] = await Promise.all([
    getTeamRoster(id, season, "active"),
    getTeamPlayerStats(id, season, "pitching").catch((): PlayerStatRow[] => []),
  ]);
  const starts = new Map(
    pitching.map((r) => [
      r.id,
      {
        gs: teamStatNum(r.values.gamesStarted) ?? 0,
        g: teamStatNum(r.values.gamesPlayed) ?? 0,
      },
    ]),
  );
  const rotation = (p: RosterEntry) => {
    const line = starts.get(p.id);
    return !!line && inRotation(line.gs, line.g);
  };

  const pitchers = roster.filter((p) => p.posType === "Pitcher");
  const arms = (starters: boolean) =>
    pitchers
      .filter((p) => rotation(p) === starters)
      .map((p) => ({ ...p, pos: starters ? "SP" : "RP" }));
  const groups: RosterGroup[] = [
    { label: "STARTING PITCHERS", players: arms(true) },
    { label: "RELIEF PITCHERS", players: arms(false) },
    ...GROUP_ORDER.map((type) => ({
      label: GROUP_LABEL[type] ?? type.toUpperCase(),
      players: roster.filter((p) => p.posType === type),
    })),
  ];

  const byName = (a: RosterEntry, b: RosterEntry) =>
    a.name.localeCompare(b.name);
  return groups
    .filter((g) => g.players.length > 0)
    .map((g) => ({ ...g, players: [...g.players].sort(byName) }));
}

/** A player on the list, with the move that put him there. */
export interface InjuryEntry extends RosterEntry {
  /** The date of that move — "" if no transaction names him this season. */
  since: string;
  /** The move in MLB's own words, which is where the injury is named. */
  note: string;
}

/**
 * Who is hurt, off the 40-man rather than the full organisation: the club's
 * injury report is its major-league list, not every rookie-ball strain.
 *
 * The roster payload carries which list a player is on and nothing else — no
 * date, no injury — so each name is joined to his own latest injured-list
 * transaction, which carries both. A player placed before the season being
 * read has no such move to find and keeps his status alone.
 */
export async function getTeamInjuries(
  id: number,
  season: number,
): Promise<InjuryEntry[]> {
  const [roster, moves] = await Promise.all([
    getTeamRoster(id, season, "40Man"),
    getTeamTransactions(id, season).catch((): Transaction[] => []),
  ]);
  /* Sorted newest first already, so the first hit is the current move — a
     transfer to the 60-day rather than the placement it superseded. */
  const onto = moves.filter(
    (t) =>
      /injured list/i.test(t.description) &&
      !/(activated|reinstated)/i.test(t.description),
  );
  return roster
    .filter((p) => injured(p.statusCode))
    .map((p): InjuryEntry => {
      const m = onto.find((t) => t.personId === p.id);
      return { ...p, since: m?.date ?? "", note: m?.description ?? "" };
    })
    .sort((a, b) => b.since.localeCompare(a.since));
}
