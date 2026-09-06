/*
 * Thin server-side client for the free public MLB Stats API
 * (statsapi.mlb.com). Called from server components only, so there is no
 * CORS or key concern. Everything here normalizes the raw payloads into the
 * small shapes the dashboard/games pages actually render.
 */
const BASE = "https://statsapi.mlb.com/api/v1";

/** Division id → short name. These ids are fixed; no lookup needed. */
const DIVISIONS: Record<number, string> = {
  200: "AL WEST",
  201: "AL EAST",
  202: "AL CENTRAL",
  203: "NL WEST",
  204: "NL EAST",
  205: "NL CENTRAL",
};

/*
 * The order the divisions are read in — east to west down each league, the way
 * every scoreboard prints them. Alphabetical order by name would open the
 * American League on its Central.
 */
const DIVISION_ORDER = [201, 202, 200, 204, 205, 203];

/** League id → display name. Fixed alongside the division ids above. */
const LEAGUES: Record<number, string> = {
  103: "AMERICAN LEAGUE",
  104: "NATIONAL LEAGUE",
};

/** Team logo — degrades to alt text if unreachable. */
/**
 * A club's page URL — `/team/137-san-francisco-giants`.
 *
 * The id leads so the route never has to look a name up, which matters for
 * the clubs that only exist in old standings (the 1884 Union Association is
 * not in the current teams list); the slug is there for the reader, and a
 * bare `/team/137` still resolves.
 */
export const teamHref = (id: number, name: string, tab = ""): string =>
  `/team/${id}${teamSlug(name)}${tab && `/${tab}`}`;

const teamSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `-${slug}` : "";
};

/** The club id out of a `137-san-francisco-giants` segment, or NaN. */
export const teamIdOf = (param: string): number =>
  /^\d+(-|$)/.test(param) ? Number.parseInt(param, 10) : NaN;

export const teamLogo = (id: number) =>
  `https://www.mlbstatic.com/team-logos/${id}.svg`;

/**
 * Player headshot, square. MLB's own CDN answers with a generic silhouette
 * for anyone it has no photo of, so a missing headshot needs no fallback of
 * ours — every id returns an image.
 */
/* The silo cutout rather than the "spot": both are transparent at the corners,
   but the spot fills its circle with the club's colour, and a list of players
   from eight clubs reads as eight coloured discs before it reads as faces. */
export const playerHeadshot = (id: number, size = 60) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_${size},q_auto:best/v1/people/${id}/headshot/silo/current.png`;

/** Today's date in America/New_York (MLB's game day), as YYYY-MM-DD. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

export const seasonOf = (isoDate: string) => Number(isoDate.slice(0, 4));

/**
 * MLB's first season, and the floor of the leader boards' season picker —
 * the StatsAPI carries league leaders the whole way back, so 1876 is a real
 * bound rather than an arbitrary one.
 */
export const FIRST_SEASON = 1876;

async function mlb(path: string, revalidate: number): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${path}`);
  return res.json();
}

/* ── Schedule / scoreboard ──────────────────────────────────────────── */

export interface GameSide {
  id: number;
  name: string;
  abbr: string;
  score: number | null;
  wins: number | null;
  losses: number | null;
  isWinner: boolean;
  probable: { id: number; name: string } | null;
}

/** Who won, lost and saved it — empty until a game is final. */
export interface Decisions {
  winner: { id: number; name: string } | null;
  loser: { id: number; name: string } | null;
  save: { id: number; name: string } | null;
}

export interface Game {
  pk: number;
  state: "Preview" | "Live" | "Final" | string;
  detailedState: string;
  startTime: string; // ISO
  venue: string;
  inning: number | null;
  inningState: string | null;
  away: GameSide;
  home: GameSide;
  decisions: Decisions;
  /** Tickets counted through the gate, null for a game not yet played. */
  attendance: number | null;
}

function side(raw: any): GameSide {
  const t = raw.team ?? {};
  return {
    id: t.id,
    name: t.name ?? "TBD",
    abbr: t.abbreviation ?? "—",
    score: typeof raw.score === "number" ? raw.score : null,
    wins: raw.leagueRecord?.wins ?? null,
    losses: raw.leagueRecord?.losses ?? null,
    isWinner: !!raw.isWinner,
    probable: person(raw.probablePitcher),
  };
}

const toGame = (g: any): Game => ({
  pk: g.gamePk,
  state: g.status?.abstractGameState ?? "Preview",
  detailedState: g.status?.detailedState ?? "",
  startTime: g.gameDate,
  venue: g.venue?.name ?? "",
  inning: g.linescore?.currentInning ?? null,
  inningState: g.linescore?.inningState ?? null,
  away: side(g.teams?.away ?? {}),
  home: side(g.teams?.home ?? {}),
  decisions: {
    winner: person(g.decisions?.winner),
    loser: person(g.decisions?.loser),
    save: person(g.decisions?.save),
  },
  attendance: g.gameInfo?.attendance ?? null,
});

/** The pitcher of a decision or a probable, or null when there isn't one. */
const person = (p: any) =>
  p?.id ? { id: p.id, name: p.fullName ?? "—" } : null;

/* Decisions and the gate count ride along with every schedule read: they are
 * a few hundred bytes a game, and it keeps one hydrate string to keep right. */
const SCHEDULE_HYDRATE = "probablePitcher,linescore,team,decisions,gameInfo";

export async function getSchedule(date: string): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&date=${date}&hydrate=${SCHEDULE_HYDRATE}`,
    60,
  );
  return (data.dates?.[0]?.games ?? []).map(toGame);
}

/**
 * One game's schedule row — the header half of /game/[pk] (records, status,
 * venue, probables), which the box score payload alone doesn't carry. Null for
 * an unknown gamePk so the route can 404.
 */
export async function getGame(pk: number): Promise<Game | null> {
  const data = await mlb(
    `/schedule?sportId=1&gamePk=${pk}&hydrate=${SCHEDULE_HYDRATE}`,
    60,
  );
  const g = data.dates?.[0]?.games?.[0];
  return g ? toGame(g) : null;
}

/** Scoreboard order — live first, then upcoming, then finals; earliest first. */
const STATE_ORDER: Record<string, number> = { Live: 0, Preview: 1, Final: 2 };

export const sortGames = (games: Game[]): Game[] =>
  games
    .slice()
    .sort(
      (a, b) =>
        (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) ||
        a.startTime.localeCompare(b.startTime),
    );

/**
 * Baseball's home zone, and the fallback for a first-pitch time whenever the
 * viewer's own can't be known — on the server, which renders in UTC, and in a
 * browser whose Intl won't name a zone.
 */
export const FALLBACK_TZ = "America/New_York";

/**
 * The one-line status a game shows everywhere: half-inning while live, the
 * detailed state once final, otherwise first pitch. `tone` picks the colour
 * without the caller re-deriving the state.
 *
 * First pitch carries its zone abbreviation ("7:05 PM PDT") so the number is
 * never ambiguous. The zone is passed in rather than left to Intl's default:
 * these cards are server-rendered, and the server's default is UTC, which is
 * nobody's local time. See useTimeZone for who supplies the viewer's.
 */
export function gameStatus(
  g: Game,
  timeZone: string = FALLBACK_TZ,
): {
  text: string;
  tone: "live" | "final" | "pre";
} {
  /* Warmup carries a Top 1 linescore before a pitch is thrown; say so. */
  if (g.detailedState === "Warmup") {
    return { text: "WARMUP", tone: "live" };
  }
  if (g.state === "Live") {
    const half = g.inningState ? g.inningState.slice(0, 3).toUpperCase() : "";
    return { text: `${half} ${g.inning ?? ""}`.trim(), tone: "live" };
  }
  if (g.state === "Final") {
    /* Extra innings carry the inning it ended in — "FINAL/10". */
    const extra = g.inning && g.inning > 9 ? `/${g.inning}` : "";
    return { text: g.detailedState.toUpperCase() + extra, tone: "final" };
  }
  return { text: clock(g.startTime, timeZone), tone: "pre" };
}

/** "7:40 PM PDT" — a first pitch in the zone it is being read in. */
const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));

/** The same clock with the day it falls on — "7:40 PM PDT · TUE, SEP 1, 2026". */
export const firstPitch = (iso: string, timeZone: string): string =>
  `${clock(iso, timeZone)} · ${new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  })
    .format(new Date(iso))
    .toUpperCase()}`;

/* ── Box score ──────────────────────────────────────────────────────── */

export interface BoxBatter {
  id: number;
  name: string;
  pos: string;
  /** Spot in the order, 1-9. */
  order: number;
  /** Entered mid-game — indented under the starter it replaced, savant-style. */
  sub: boolean;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  hr: number;
  bb: number;
  k: number;
  avg: string; // season, not game
  ops: string; // season, not game
}

export interface BoxPitcher {
  id: number;
  name: string;
  /** "(W, 11-5)" / "(L, 4-2)" / "(S, 21)" when this pitcher got the decision. */
  decision: string;
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitches: number;
  strikes: number;
  era: string; // season
}

export interface BoxTeam {
  id: number;
  name: string;
  abbr: string;
  runs: number | null;
  hits: number | null;
  errors: number | null;
  lob: number | null;
  /** The club's running totals, the figures the two sides are compared on. */
  totals: Record<"hitting" | "pitching", Record<string, TeamStatValue>>;
  batters: BoxBatter[];
  pitchers: BoxPitcher[];
}

/* What a live game compares the two clubs on — the counting stats that move
   during a game, not the rates that need a season to mean anything. */
export const TOTAL_ROWS: Record<"hitting" | "pitching", TeamStatCol[]> = {
  hitting: [
    { key: "hits", label: "HITS", title: "Hits" },
    { key: "homeRuns", label: "HOME RUNS", title: "Home runs" },
    { key: "totalBases", label: "TOTAL BASES", title: "Total bases" },
    { key: "baseOnBalls", label: "WALKS", title: "Walks drawn" },
    { key: "strikeOuts", label: "STRIKEOUTS", title: "Strikeouts taken" },
    { key: "leftOnBase", label: "RUNNERS LOB", title: "Runners left on base" },
  ],
  pitching: [
    { key: "strikeOuts", label: "STRIKEOUTS", title: "Strikeouts recorded" },
    { key: "baseOnBalls", label: "WALKS", title: "Walks issued" },
    { key: "hits", label: "HITS", title: "Hits allowed" },
    { key: "runs", label: "RUNS", title: "Runs allowed" },
    { key: "earnedRuns", label: "EARNED RUNS", title: "Earned runs allowed" },
    { key: "homeRuns", label: "HOME RUNS", title: "Home runs allowed" },
  ],
};

export interface BoxInning {
  num: number;
  away: number | null;
  home: number | null;
}

export interface BoxScore {
  pk: number;
  scheduledInnings: number;
  innings: BoxInning[];
  away: BoxTeam;
  home: BoxTeam;
}

const total = (stat: any, group: "hitting" | "pitching") =>
  Object.fromEntries(
    TOTAL_ROWS[group].map((c) => [c.key, stat?.[c.key] ?? null]),
  );

/** A starter's battingOrder is a round hundred ("100"); subs are "101", "102". */
const isSub = (order: string | undefined) => !!order && !/00$/.test(order);

function boxTeam(raw: any, line: any): BoxTeam {
  const players = raw.players ?? {};
  const at = (id: number) => players[`ID${id}`] ?? {};
  return {
    id: raw.team?.id,
    name: raw.team?.name ?? "—",
    abbr: raw.team?.abbreviation ?? "—",
    runs: line?.runs ?? null,
    hits: line?.hits ?? null,
    errors: line?.errors ?? null,
    lob: line?.leftOnBase ?? null,
    totals: {
      hitting: total(raw.teamStats?.batting, "hitting"),
      pitching: total(raw.teamStats?.pitching, "pitching"),
    },
    /* `batters` also carries every pitcher who appeared, batting order or not.
       No battingOrder means the club never sent them to the plate, so they are
       not part of the batting line. */
    batters: (raw.batters ?? [])
      .filter((id: number) => at(id).battingOrder)
      .map((id: number): BoxBatter => {
        const p = at(id);
        const s = p.stats?.batting ?? {};
        return {
          id,
          name: p.person?.fullName ?? "—",
          pos: p.position?.abbreviation ?? "",
          order: Math.floor(Number(p.battingOrder) / 100),
          sub: isSub(p.battingOrder),
          ab: s.atBats ?? 0,
          r: s.runs ?? 0,
          h: s.hits ?? 0,
          rbi: s.rbi ?? 0,
          hr: s.homeRuns ?? 0,
          bb: s.baseOnBalls ?? 0,
          k: s.strikeOuts ?? 0,
          avg: p.seasonStats?.batting?.avg ?? "—",
          ops: p.seasonStats?.batting?.ops ?? "—",
        };
      }),
    pitchers: (raw.pitchers ?? []).map((id: number): BoxPitcher => {
      const p = at(id);
      const s = p.stats?.pitching ?? {};
      return {
        id,
        name: p.person?.fullName ?? "—",
        decision: s.note ?? "",
        ip: s.inningsPitched ?? "0.0",
        h: s.hits ?? 0,
        r: s.runs ?? 0,
        er: s.earnedRuns ?? 0,
        bb: s.baseOnBalls ?? 0,
        k: s.strikeOuts ?? 0,
        hr: s.homeRuns ?? 0,
        pitches: s.pitchesThrown ?? s.numberOfPitches ?? 0,
        strikes: s.strikes ?? 0,
        era: p.seasonStats?.pitching?.era ?? "—",
      };
    }),
  };
}

/**
 * Full box score for one game: inning-by-inning line plus both teams' batting
 * and pitching lines. Boxscore and linescore are separate endpoints, so they
 * are fetched together and merged. Short revalidate — a live game moves.
 */
export async function getBoxScore(pk: number): Promise<BoxScore> {
  const [box, line] = await Promise.all([
    mlb(`/game/${pk}/boxscore`, 30),
    mlb(`/game/${pk}/linescore`, 30),
  ]);
  return {
    pk,
    scheduledInnings: line.scheduledInnings ?? 9,
    innings: (line.innings ?? []).map(
      (i: any): BoxInning => ({
        num: i.num,
        away: i.away?.runs ?? null,
        home: i.home?.runs ?? null,
      }),
    ),
    away: boxTeam(box.teams?.away ?? {}, line.teams?.away),
    home: boxTeam(box.teams?.home ?? {}, line.teams?.home),
  };
}

/* ── Standings ──────────────────────────────────────────────────────── */

/**
 * One club's line in the standings. Rank comes in three flavours because the
 * standings page shows the same rows grouped three ways (division / league /
 * all MLB). Games back does not: MLB only computes it against the division,
 * and not at all for spring training, so the table works it out per group from
 * the wins and losses instead. Every row carries its own division and league
 * so it stays self-describing once lifted out of its division table.
 */
export interface StandingRow {
  id: number;
  name: string;
  /** The club's town on its own — "Los Angeles" out of "Los Angeles Dodgers".
   *  Falls back to the whole name for the club that has none, the Athletics. */
  city: string;
  divisionId: number;
  division: string;
  leagueId: number;
  league: string;
  wins: number;
  losses: number;
  pct: string;
  gb: string;
  divRank: string;
  leagueRank: string;
  sportRank: string;
  /** Place in the wild-card race, and games back of the last playoff spot. */
  wcRank: string;
  wcGb: string;
  /**
   * Magic numbers for the division and the wild card — how many combined
   * wins by the clubs ahead and losses by this one would end the chase, or
   * "E" once it already has. A club is out of the playoffs only when both
   * read "E": losing the division still leaves the wild card.
   */
  elim: string;
  wcElim: string;
  streak: string;
  runsScored: number;
  runsAllowed: number;
  runDiff: number;
  /** W-L over the club's last ten, and its home / road splits. */
  last10: string;
  home: string;
  away: string;
  /** "z"/"y"/"w" etc. when the club has clinched something; "" otherwise. */
  clinch: string;
}

export interface Division {
  id: number;
  name: string;
  leagueId: number;
  league: string;
  teams: StandingRow[];
}

/** "54-27" for one of the API's split records, "—" when it isn't reported. */
function splitRecord(splits: any[] | undefined, type: string): string {
  const s = (splits ?? []).find((x: any) => x.type === type);
  return s ? `${s.wins ?? 0}-${s.losses ?? 0}` : "—";
}

/*
 * Which slice of the calendar a standings or team-stats view is reading.
 * Spring training is its own set of records and its own game type, so the
 * same season number means two different tables depending on this.
 */
export type GameType = "R" | "S";

export const GAME_TYPES: { value: GameType; label: string }[] = [
  { value: "R", label: "REGULAR SEASON" },
  { value: "S", label: "SPRING TRAINING" },
];

/** Anything but an explicit "S" reads as the regular season. */
export const pickGameType = (raw: string | undefined): GameType =>
  raw === "S" ? "S" : "R";

/**
 * One club's row, off a `teamRecords` entry. The division and league are read
 * off the hydrated team rather than the record it arrived in, because the
 * wild-card payload groups by league and labels each group with an arbitrary
 * one of its divisions.
 */
/* MLB's own locationName is where the park is rather than what the club is
   called — the Yankees play in the Bronx and the Rangers in Arlington — so the
   town is the name with the club taken off the end of it. The one club with no
   town in its name, the Athletics, keeps the whole thing. */
export const clubCity = (name: string, clubName: string) =>
  name.slice(0, name.length - clubName.length).trim() || name;

function standingRow(t: any): StandingRow {
  const splits = t.records?.splitRecords;
  const divisionId = t.team?.division?.id;
  const leagueId = t.team?.league?.id;
  const name = t.team?.name ?? "—";
  return {
    id: t.team?.id,
    name,
    city: clubCity(name, t.team?.clubName ?? ""),
    divisionId,
    division: DIVISIONS[divisionId] ?? `DIV ${divisionId}`,
    leagueId,
    league: LEAGUES[leagueId] ?? `LEAGUE ${leagueId}`,
    wins: t.wins ?? 0,
    losses: t.losses ?? 0,
    pct: t.winningPercentage ?? "—",
    gb: t.gamesBack ?? "-",
    divRank: t.divisionRank ?? "—",
    leagueRank: t.leagueRank ?? "—",
    sportRank: t.sportRank ?? "—",
    wcRank: t.wildCardRank ?? "—",
    wcGb: t.wildCardGamesBack ?? "-",
    elim: t.eliminationNumber ?? "",
    wcElim: t.wildCardEliminationNumber ?? "",
    streak: t.streak?.streakCode ?? "—",
    runsScored: t.runsScored ?? 0,
    runsAllowed: t.runsAllowed ?? 0,
    runDiff: t.runDifferential ?? 0,
    last10: splitRecord(splits, "lastTen"),
    home: splitRecord(splits, "home"),
    away: splitRecord(splits, "away"),
    clinch: t.clinchIndicator ?? "",
  };
}

/** Hydrating the team gets full club names ("Tampa Bay Rays"); the bare
 * payload carries only the nickname ("Rays"), which reads as ambiguous once
 * rows are merged into a league-wide or all-MLB table. */
const standingsUrl = (season: number, type: string) =>
  `/standings?leagueId=103,104&season=${season}&standingsTypes=${type}&hydrate=team`;

export async function getStandings(
  season: number,
  gameType: GameType = "R",
): Promise<Division[]> {
  const data = await mlb(
    standingsUrl(season, gameType === "S" ? "springTraining" : "regularSeason"),
    1800,
  );
  const records = (data.records ?? []) as any[];
  return records
    .map((r): Division => {
      const divisionId = r.division?.id;
      const leagueId = r.league?.id;
      return {
        id: divisionId,
        name: DIVISIONS[divisionId] ?? `DIV ${divisionId}`,
        leagueId,
        league: LEAGUES[leagueId] ?? `LEAGUE ${leagueId}`,
        teams: (r.teamRecords ?? []).map(standingRow),
      };
    })
    .sort(
      (a, b) => DIVISION_ORDER.indexOf(a.id) - DIVISION_ORDER.indexOf(b.id),
    );
}

/*
 * Games back, worked out from the rows rather than read off the payload.
 *
 * It is relative to whatever group it is being shown in — at league scope a
 * club's distance is from the best record in its league, not its division —
 * and MLB only reports the division figure reliably: its all-MLB number is
 * blank for every club in spring training, and so is its division one, which
 * left a spring table reading "-" for all thirty. One subtraction covers every
 * scope and both game types, and reproduces MLB's own regular-season figures
 * exactly.
 *
 * The reference is the club with the best win-loss margin rather than the best
 * percentage, because games back is a function of that margin alone: measuring
 * from it is what keeps every other figure at or above zero, even in April
 * when clubs have played unequal numbers of games.
 */
const margin = (r: StandingRow) => r.wins - r.losses;

export function gamesBack(teams: StandingRow[]): (r: StandingRow) => number {
  const lead = Math.max(...teams.map(margin));
  return (r) => (lead - margin(r)) / 2;
}

/**
 * The wild-card race, one group per league. MLB's `wildCard` standings type
 * drops the three division leaders and ranks everyone left by their distance
 * from the last playoff berth, which is exactly the race — so the cut line is
 * simply after the third row of each group.
 */
export interface WildCardGroup {
  id: number;
  name: string;
  /** Rows in wild-card order; the first `berths` of them hold a spot. */
  teams: StandingRow[];
}

/** Wild-card berths per league — three since the 2022 expansion. */
export const WC_BERTHS = 3;

export async function getWildCard(season: number): Promise<WildCardGroup[]> {
  const data = await mlb(standingsUrl(season, "wildCard"), 1800);
  return ((data.records ?? []) as any[])
    .map((r): WildCardGroup => {
      const leagueId = r.league?.id;
      return {
        id: leagueId,
        name: LEAGUES[leagueId] ?? `LEAGUE ${leagueId}`,
        teams: (r.teamRecords ?? [])
          .map(standingRow)
          .sort(
            (a: StandingRow, b: StandingRow) =>
              (Number(a.wcRank) || 99) - (Number(b.wcRank) || 99),
          ),
      };
    })
    .sort((a, b) => a.id - b.id);
}

/* ── Team statistics ────────────────────────────────────────────────── */

/** A single team stat cell. Strings arrive pre-formatted (".265", "3.47"). */
export type TeamStatValue = number | string | null;

export interface TeamStatCol {
  /** statsapi key inside the split's `stat` object. */
  key: string;
  label: string;
  /** Long form of the abbreviation — the column tooltip and the glossary entry. */
  title: string;
}

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

/**
 * Sort key for a stat cell. Rate strings (".265", "3.47") parse cleanly;
 * anything unparseable is null so the table can sink it to the bottom in
 * both directions rather than sorting it as zero.
 */
export const teamStatNum = (v: TeamStatValue): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const cols = (group: "hitting" | "pitching") =>
  group === "hitting" ? TEAM_HITTING_COLS : TEAM_PITCHING_COLS;

async function teamStatTable(
  group: "hitting" | "pitching",
  season: number,
  gameType: GameType,
): Promise<TeamStatTable> {
  const data = await mlb(
    `/teams/stats?season=${season}&sportIds=1&group=${group}&stats=season&gameType=${gameType}`,
    1800,
  );
  const splits = (data.stats?.[0]?.splits ?? []) as any[];
  const columns = cols(group);
  return {
    group,
    columns,
    rows: splits.map((s): TeamStatRow => {
      const stat = s.stat ?? {};
      return {
        id: s.team?.id,
        name: s.team?.name ?? "—",
        values: Object.fromEntries(
          columns.map((c) => [c.key, stat[c.key] ?? null]),
        ),
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
): Promise<TeamStatTable[]> {
  return Promise.all([
    teamStatTable("hitting", season, gameType),
    teamStatTable("pitching", season, gameType),
  ]);
}

/* ── Search ─────────────────────────────────────────────────────────── */

/** One suggestion in the header search — a club or a person. */
export interface SearchHit {
  kind: "player" | "team";
  id: number;
  name: string;
  /** Position and club for a player; league and division for a team. */
  detail: string;
}

/** The 30 clubs, cached for a day — they change once a decade. */
async function mlbTeams(): Promise<any[]> {
  const data = await mlb(`/teams?sportId=1`, 86400);
  return (data.teams ?? []) as any[];
}

/**
 * Clubs and people matching what has been typed, clubs first.
 *
 * MLB's people search covers the whole of organised baseball, so a query lands
 * minor leaguers and long-retired players alongside the major leaguer almost
 * everyone means. Current major leaguers are floated to the top rather than
 * filtered out, since a search for a retired great should still find him.
 */
export async function searchAll(q: string, limit = 8): Promise<SearchHit[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const [teams, people] = await Promise.all([
    mlbTeams().catch(() => [] as any[]),
    mlb(
      `/people/search?names=${encodeURIComponent(needle)}&hydrate=currentTeam`,
      3600,
    )
      .then((d) => (d.people ?? []) as any[])
      .catch(() => [] as any[]),
  ]);

  const teamHits: SearchHit[] = teams
    .filter((t) =>
      [t.name, t.teamName, t.locationName, t.abbreviation]
        .filter(Boolean)
        .some((f: string) => f.toLowerCase().includes(needle)),
    )
    .map((t) => ({
      kind: "team" as const,
      id: t.id,
      name: t.name,
      detail: [LEAGUES[t.league?.id], DIVISIONS[t.division?.id]]
        .filter(Boolean)
        .join(" · "),
    }));

  const major = new Set(teams.map((t) => t.id));
  const playerHits = people
    .map((p) => ({
      kind: "player" as const,
      id: p.id,
      name: p.fullName ?? "—",
      detail: [p.primaryPosition?.abbreviation, p.currentTeam?.name]
        .filter(Boolean)
        .join(" · "),
      rank: major.has(p.currentTeam?.id) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...hit }): SearchHit => hit);

  return [...teamHits, ...playerHits].slice(0, limit);
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

/* ── Leaderboards ───────────────────────────────────────────────────── */

export interface LeaderRow {
  rank: number;
  personId: number;
  name: string;
  team: string;
  value: string;
}

export interface Leaderboard {
  /** "group.category" — a category like strikeouts runs in both groups. */
  code: string;
  label: string;
  group: "hitting" | "pitching";
  /** The stat key the full board sorts on — where MORE hands the reader off. */
  stat: string;
  leaders: LeaderRow[];
}

/**
 * (category, statGroup, display label) for each board we surface, in the
 * order they fill the grid. WAR has no place here — the StatsAPI publishes
 * no such leader category, since the figure is a third-party derivation
 * (bWAR, fWAR) rather than an official MLB stat.
 */
const LEADER_SPECS: {
  cat: string;
  group: "hitting" | "pitching";
  label: string;
  /* The same figure under its `stat` key, which is what the full player table
     sorts on — the leader categories have names of their own. */
  stat: string;
}[] = [
  { cat: "battingAverage", group: "hitting", label: "AVG", stat: "avg" },
  { cat: "onBasePlusSlugging", group: "hitting", label: "OPS", stat: "ops" },
  { cat: "hits", group: "hitting", label: "HITS", stat: "hits" },
  { cat: "doubles", group: "hitting", label: "DOUBLES", stat: "doubles" },
  { cat: "triples", group: "hitting", label: "TRIPLES", stat: "triples" },
  { cat: "homeRuns", group: "hitting", label: "HOME RUNS", stat: "homeRuns" },
  { cat: "runsBattedIn", group: "hitting", label: "RBI", stat: "rbi" },
  {
    cat: "strikeouts",
    group: "hitting",
    label: "STRIKEOUTS",
    stat: "strikeOuts",
  },
  { cat: "walks", group: "hitting", label: "WALKS", stat: "baseOnBalls" },
  {
    cat: "stolenBases",
    group: "hitting",
    label: "STOLEN BASES",
    stat: "stolenBases",
  },
  { cat: "earnedRunAverage", group: "pitching", label: "ERA", stat: "era" },
  { cat: "wins", group: "pitching", label: "WINS", stat: "wins" },
  { cat: "losses", group: "pitching", label: "LOSSES", stat: "losses" },
  {
    cat: "inningsPitched",
    group: "pitching",
    label: "INNINGS PITCHED",
    stat: "inningsPitched",
  },
  {
    cat: "strikeouts",
    group: "pitching",
    label: "STRIKEOUTS",
    stat: "strikeOuts",
  },
  { cat: "walks", group: "pitching", label: "WALKS", stat: "baseOnBalls" },
  {
    cat: "earnedRun",
    group: "pitching",
    label: "EARNED RUNS",
    stat: "earnedRuns",
  },
  { cat: "whip", group: "pitching", label: "WHIP", stat: "whip" },
  { cat: "saves", group: "pitching", label: "SAVES", stat: "saves" },
];

async function oneBoard(
  spec: (typeof LEADER_SPECS)[number],
  season: number,
  limit: number,
): Promise<Leaderboard> {
  const data = await mlb(
    `/stats/leaders?leaderCategories=${spec.cat}&statGroup=${spec.group}&season=${season}&sportId=1&limit=${limit}`,
    1800,
  );
  const leaders = (data.leagueLeaders?.[0]?.leaders ?? []) as any[];
  return {
    code: `${spec.group}.${spec.cat}`,
    label: spec.label,
    group: spec.group,
    stat: spec.stat,
    leaders: leaders.map(
      (l): LeaderRow => ({
        rank: l.rank,
        personId: l.person?.id,
        name: l.person?.fullName ?? "—",
        team: l.team?.name ?? "",
        value: l.value,
      }),
    ),
  };
}

export async function getLeaderboards(
  season: number,
  limit = 20,
): Promise<Leaderboard[]> {
  return Promise.all(LEADER_SPECS.map((s) => oneBoard(s, season, limit)));
}

/* ── Player summary ─────────────────────────────────────────────────── */

export interface StatLine {
  group: "hitting" | "pitching";
  team: string;
  /** (label, value) in display order — the first four are the headline tiles. */
  stats: [string, string][];
}

export interface PlayerSummary {
  id: number;
  name: string;
  number: string;
  pos: string;
  team: string;
  teamId: number | null;
  bats: string;
  throws: string;
  age: number | null;
  height: string;
  weight: number | null;
  debut: string;
  /** Empty when the player has no line in this season (a two-way player has two). */
  lines: StatLine[];
}

/* (label, statcast/statsapi key). Order matters: first four → MetricCards. */
const HITTING_KEYS: [string, string][] = [
  ["AVG", "avg"],
  ["HR", "homeRuns"],
  ["RBI", "rbi"],
  ["OPS", "ops"],
  ["G", "gamesPlayed"],
  ["PA", "plateAppearances"],
  ["AB", "atBats"],
  ["H", "hits"],
  ["2B", "doubles"],
  ["3B", "triples"],
  ["R", "runs"],
  ["BB", "baseOnBalls"],
  ["K", "strikeOuts"],
  ["SB", "stolenBases"],
  ["OBP", "obp"],
  ["SLG", "slg"],
];

const PITCHING_KEYS: [string, string][] = [
  ["ERA", "era"],
  ["W-L", "record"], // synthesized below
  ["K", "strikeOuts"],
  ["WHIP", "whip"],
  ["G", "gamesPlayed"],
  ["GS", "gamesStarted"],
  ["SV", "saves"],
  ["IP", "inningsPitched"],
  ["H", "hits"],
  ["ER", "earnedRuns"],
  ["HR", "homeRuns"],
  ["BB", "baseOnBalls"],
  ["K/9", "strikeoutsPer9Inn"],
  ["BB/9", "walksPer9Inn"],
  ["OAVG", "avg"],
  ["P", "numberOfPitches"],
];

/**
 * One player's identity plus their season hitting and/or pitching line, as
 * rendered by /player/[id]. Returns null for an unknown id so the route can
 * 404 instead of throwing. Season stats move once a day at most — long
 * revalidate.
 */
export async function getPlayer(
  id: number,
  season: number,
): Promise<PlayerSummary | null> {
  const data = await mlb(
    `/people/${id}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`,
    1800,
  ).catch((e: Error) => {
    // Unknown id → null so the route 404s; anything else is an outage and
    // must surface as one, not as "no such player".
    if (e.message.includes(" 404:")) return null;
    throw e;
  });
  const p = data?.people?.[0];
  if (!p) return null;

  const lines: StatLine[] = [];
  for (const s of (p.stats ?? []) as any[]) {
    const group = s.group?.displayName;
    if (group !== "hitting" && group !== "pitching") continue;
    const split = s.splits?.[0];
    if (!split) continue;
    const stat = { ...split.stat };
    // A pitcher who never came to the plate still gets an all-zero hitting
    // split back. No plate appearances, no hitting line.
    if (group === "hitting" && !stat.plateAppearances) continue;
    stat.record = `${stat.wins ?? 0}-${stat.losses ?? 0}`;
    const keys = group === "hitting" ? HITTING_KEYS : PITCHING_KEYS;
    lines.push({
      group,
      team: split.team?.name ?? "",
      stats: keys.map(([label, key]) => [
        label,
        stat[key] === undefined || stat[key] === null ? "—" : String(stat[key]),
      ]),
    });
  }

  return {
    id: p.id,
    name: p.fullName ?? "—",
    number: p.primaryNumber ?? "",
    pos: p.primaryPosition?.abbreviation ?? "",
    team: p.currentTeam?.name ?? "",
    teamId: p.currentTeam?.id ?? null,
    bats: p.batSide?.code ?? "?",
    throws: p.pitchHand?.code ?? "?",
    age: p.currentAge ?? null,
    height: p.height ?? "",
    weight: p.weight ?? null,
    debut: p.mlbDebutDate ?? "",
    lines,
  };
}

/**
 * Every major-league season the player has a hitting or pitching line in,
 * newest first — the seasons /player/[id] will actually find stats for. A
 * traded player has one split per club in a season, so the years are deduped.
 * Empty for an unknown id or a player who has never appeared in one, which
 * the page reads as "current season only". A career only gains a season a
 * year, so this caches for a day.
 */
export async function getPlayerSeasons(id: number): Promise<number[]> {
  const data = await mlb(
    `/people/${id}/stats?stats=yearByYear&group=hitting,pitching&sportId=1`,
    86400,
  ).catch((e: Error) => {
    if (e.message.includes(" 404:")) return null;
    throw e;
  });

  const seasons = new Set<number>();
  for (const s of (data?.stats ?? []) as any[]) {
    for (const split of (s.splits ?? []) as any[]) {
      // sportId above filters the request, but a hydrated split can still
      // carry a minor-league team — keep only what the MLB pages can show.
      if (split.sport?.id !== undefined && split.sport.id !== 1) continue;
      const year = Number(split.season);
      if (Number.isInteger(year)) seasons.add(year);
    }
  }
  return [...seasons].sort((a, b) => b - a);
}

/* ── Clinch / elimination marks ─────────────────────────────────────── */

/**
 * How much the clinch column can say about a given payload.
 *
 *  "live"    — season in progress: only what MLB has already called, since a
 *              club without a mark may still be playing for one.
 *  "settled" — season over and MLB recorded who clinched what, so a club with
 *              no mark is a club that missed the playoffs.
 *  "none"    — season over with nothing clinched at all. Only 1994, whose
 *              post-season was cancelled by the strike: nobody clinched and
 *              nobody was eliminated in any meaningful sense, so the column is
 *              dropped rather than invented. Spring training lands here too.
 */
export type ClinchPhase = "live" | "settled" | "none";

export const clinchPhase = (
  rows: StandingRow[],
  seasonOver: boolean,
): ClinchPhase =>
  !seasonOver ? "live" : rows.some((r) => r.clinch !== "") ? "settled" : "none";

/**
 * The mark shown beside a club's name once its post-season is settled one way
 * or the other. MLB's payload uses its own letters ("z", "y", "w", and "x" for
 * the expanded 2020 field) for what a club has clinched, and reports
 * elimination separately as a pair of magic numbers, so all of it folds into
 * one symbol here.
 *
 * Elimination is the case MLB's own feed leaves ragged: a club knocked out on
 * the last day by a tiebreaker keeps a wild-card magic number of "1" forever,
 * because the number stopped updating when the season did. Three clubs across
 * 2024–25 finish that way. Once the season is settled the letters are the
 * whole truth — no letter means no October — so the magic numbers are only
 * consulted while a season is still being played.
 */
export function clinchMark(r: StandingRow, phase: ClinchPhase): string {
  if (phase === "none") return "";
  switch (r.clinch.toLowerCase()) {
    case "z":
      return "*";
    case "y":
      return "X";
    // "w" is a wild card outright; "x" is a berth that isn't a division title,
    // which since the wild card exists is the same thing.
    case "w":
    case "x":
      return "Y";
    case "e":
      return "E";
  }
  if (phase === "settled") return "E";
  return r.elim === "E" && r.wcElim === "E" ? "E" : "";
}

/** What each mark above means, for the glossary under the tables. */
export const CLINCH_LEGEND: { label: string; title: string }[] = [
  { label: "*", title: "Clinched Best League Record" },
  { label: "Y", title: "Clinched Wild Card" },
  { label: "E", title: "Eliminated from Playoff Contention" },
  { label: "X", title: "Clinched Division" },
];

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
): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&teamId=${id}&season=${season}&gameType=R,F,D,L,W&hydrate=${SCHEDULE_HYDRATE}`,
    300,
  );
  return latestByGame(
    ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? []).map(toGame),
  );
}

/* ── Individual player stats ────────────────────────────────────────── */

/**
 * Which slice of the calendar a player-stat view reads. Wider than the
 * standings' game type: a club's players have a post-season line, its
 * standings row does not.
 */
export type PlayerGameType = "R" | "P" | "S";

export const PLAYER_GAME_TYPES: { value: PlayerGameType; label: string }[] = [
  { value: "R", label: "REGULAR SEASON" },
  { value: "P", label: "POSTSEASON" },
  { value: "S", label: "SPRING TRAINING" },
];

export const pickPlayerGameType = (raw: string | undefined): PlayerGameType =>
  raw === "P" || raw === "S" ? raw : "R";

export type StatGroup = "hitting" | "pitching" | "fielding";

/** One player's line in one group — a row of the stats tab's tables. */
export interface PlayerStatRow {
  id: number;
  name: string;
  /** Fielding is reported per position, so a player has a row for each. */
  position: string;
  values: Record<string, TeamStatValue>;
}

/* The columns each table carries, in the order MLB's own lines read. */
export const PLAYER_HITTING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games played" },
  { key: "plateAppearances", label: "PA", title: "Plate appearances" },
  { key: "atBats", label: "AB", title: "At-bats" },
  /* The four rates ride with the at-bats they are figured from, ahead of the
     counting stats — a line is read for them first. */
  { key: "avg", label: "AVG", title: "Batting average — hits per at-bat" },
  { key: "obp", label: "OBP", title: "On-base percentage" },
  { key: "slg", label: "SLG", title: "Slugging percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
  { key: "runs", label: "R", title: "Runs scored" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "doubles", label: "2B", title: "Doubles" },
  { key: "triples", label: "3B", title: "Triples" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "K", title: "Strikeouts" },
  { key: "stolenBases", label: "SB", title: "Stolen bases" },
];

export const PLAYER_PITCHING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games pitched" },
  { key: "gamesStarted", label: "GS", title: "Games started" },
  { key: "wins", label: "W", title: "Wins" },
  { key: "losses", label: "L", title: "Losses" },
  { key: "saves", label: "SV", title: "Saves" },
  { key: "era", label: "ERA", title: "Earned run average" },
  { key: "whip", label: "WHIP", title: "Walks and hits per inning pitched" },
  { key: "inningsPitched", label: "IP", title: "Innings pitched" },
  { key: "hits", label: "H", title: "Hits allowed" },
  { key: "runs", label: "R", title: "Runs allowed" },
  { key: "earnedRuns", label: "ER", title: "Earned runs allowed" },
  { key: "homeRuns", label: "HR", title: "Home runs allowed" },
  { key: "baseOnBalls", label: "BB", title: "Walks issued" },
  { key: "strikeOuts", label: "K", title: "Strikeouts recorded" },
  { key: "avg", label: "OAVG", title: "Opponent batting average" },
  {
    key: "strikeoutsPer9Inn",
    label: "K/9",
    title: "Strikeouts per nine innings",
  },
];

export const PLAYER_FIELDING_COLS: TeamStatCol[] = [
  { key: "games", label: "G", title: "Games at this position" },
  { key: "gamesStarted", label: "GS", title: "Games started at this position" },
  { key: "innings", label: "INN", title: "Innings played at this position" },
  { key: "chances", label: "TC", title: "Total chances" },
  { key: "putOuts", label: "PO", title: "Putouts" },
  { key: "assists", label: "A", title: "Assists" },
  { key: "fielding", label: "FPCT", title: "Fielding percentage" },
  { key: "errors", label: "E", title: "Errors" },
  { key: "doublePlays", label: "DP", title: "Double plays turned" },
  {
    key: "rangeFactorPer9Inn",
    label: "RF/9",
    title: "Range factor per nine innings",
  },
];

/* Innings are thirds: "121.2" is 121 innings and two outs, so they are added
   as outs and written back in the same form rather than as decimals. */
const outsOf = (v: TeamStatValue): number => {
  const n = teamStatNum(v);
  if (n === null) return 0;
  const whole = Math.trunc(n);
  return whole * 3 + Math.round((n - whole) * 10);
};

const inningsOf = (outs: number): string =>
  `${Math.floor(outs / 3)}.${outs % 3}`;

/**
 * One row per player rather than one per position. MLB reports fielding per
 * position, so a shortstop who filled in at second arrives twice and neither
 * line is his season; the counting stats add up, the rates are recomputed from
 * the totals (an average of two percentages isn't one), and the position shown
 * is where he played the most innings, starred if there were others.
 */
export function mergeFielding(rows: PlayerStatRow[]): PlayerStatRow[] {
  const SUM = [
    "games",
    "gamesStarted",
    "chances",
    "putOuts",
    "assists",
    "errors",
    "doublePlays",
  ];
  const byPlayer = new Map<
    number,
    { row: PlayerStatRow; outs: number; spots: { pos: string; outs: number }[] }
  >();

  for (const r of rows) {
    const outs = outsOf(r.values.innings);
    const seen = byPlayer.get(r.id);
    if (!seen) {
      byPlayer.set(r.id, {
        row: { ...r, values: { ...r.values } },
        outs,
        spots: [{ pos: r.position, outs }],
      });
      continue;
    }
    for (const k of SUM)
      seen.row.values[k] =
        (teamStatNum(seen.row.values[k]) ?? 0) +
        (teamStatNum(r.values[k]) ?? 0);
    seen.outs += outs;
    seen.spots.push({ pos: r.position, outs });
  }

  return [...byPlayer.values()].map(({ row, outs, spots }) => {
    const po = teamStatNum(row.values.putOuts) ?? 0;
    const assists = teamStatNum(row.values.assists) ?? 0;
    const errors = teamStatNum(row.values.errors) ?? 0;
    /* Chances go unreported often enough that the sum of the three is the
       safer denominator; it is what a total chance is. */
    const tc = Math.max(
      teamStatNum(row.values.chances) ?? 0,
      po + assists + errors,
    );
    row.position = spots.reduce((a, b) => (b.outs > a.outs ? b : a)).pos;
    row.values.innings = inningsOf(outs);
    row.values.chances = tc;
    row.values.fielding = tc
      ? ((po + assists) / tc).toFixed(3).replace(/^0/, "")
      : null;
    row.values.rangeFactorPer9Inn = outs
      ? (((po + assists) * 27) / outs).toFixed(2)
      : null;
    return row;
  });
}

export const playerCols = (group: StatGroup): TeamStatCol[] =>
  group === "hitting"
    ? PLAYER_HITTING_COLS
    : group === "pitching"
      ? PLAYER_PITCHING_COLS
      : PLAYER_FIELDING_COLS;

/**
 * Every player on a club's season, one row each — the stats tab's tables and
 * the source the home tab's leader boards are ranked from.
 *
 * `playerPool=ALL` is what makes it every player: the default pool is the
 * qualified one, which on a club with an injured rotation answers with a
 * single pitcher. Qualification is a property of a leader board, not of the
 * roster, so it is applied where the boards are built instead.
 */
export async function getTeamPlayerStats(
  id: number,
  season: number,
  group: StatGroup,
  gameType: PlayerGameType = "R",
): Promise<PlayerStatRow[]> {
  const data = await mlb(
    `/stats?stats=season&group=${group}&season=${season}&teamId=${id}` +
      `&gameType=${gameType}&sportId=1&playerPool=ALL&limit=200`,
    1800,
  );
  const columns = playerCols(group);
  const rows = ((data.stats?.[0]?.splits ?? []) as any[]).map(
    (s): PlayerStatRow => {
      const stat = s.stat ?? {};
      return {
        id: s.player?.id,
        name: s.player?.fullName ?? "—",
        position: s.position?.abbreviation ?? "",
        values: Object.fromEntries(
          columns.map((c) => [c.key, stat[c.key] ?? null]),
        ),
      };
    },
  );
  if (group === "fielding") return mergeFielding(rows);
  /* `playerPool=ALL` answers with every pitcher who ever appeared, each with an
     empty batting line. A pitcher belongs on a hitting table only if he
     actually hit — a pinch-hit appearance in a blowout counts, a row of zeros
     does not. */
  return group === "hitting"
    ? rows.filter(
        (r) =>
          r.position !== "P" ||
          (teamStatNum(r.values.plateAppearances) ?? 0) > 0,
      )
    : rows;
}

/* ── League-wide player leaders ─────────────────────────────────────── */

/** One line of the full player leaderboard — a stat table row with a rank. */
export interface StatLeaderRow extends PlayerStatRow {
  /** MLB's own rank in the sort, ties sharing a number. */
  rank: number | null;
  team: string;
  teamId: number | null;
}

export interface StatLeaderPage {
  rows: StatLeaderRow[];
  /** Everyone who qualifies, not just the rows fetched — what MORE reads. */
  total: number;
}

export const LEADER_LEAGUES = [
  { value: "all", label: "ALL LEAGUES" },
  { value: "103", label: "AMERICAN LEAGUE" },
  { value: "104", label: "NATIONAL LEAGUE" },
];

export const LEADER_POSITIONS = [
  { value: "all", label: "ALL POSITIONS" },
  { value: "P", label: "PITCHER" },
  { value: "C", label: "CATCHER" },
  { value: "1B", label: "FIRST BASE" },
  { value: "2B", label: "SECOND BASE" },
  { value: "3B", label: "THIRD BASE" },
  { value: "SS", label: "SHORTSTOP" },
  { value: "LF", label: "LEFT FIELD" },
  { value: "CF", label: "CENTER FIELD" },
  { value: "RF", label: "RIGHT FIELD" },
  { value: "OF", label: "OUTFIELD" },
  { value: "DH", label: "DESIGNATED HITTER" },
];

/** What each group is ranked by until the reader picks a column. */
export const defaultLeaderStat = (group: StatGroup): string =>
  group === "hitting" ? "avg" : group === "pitching" ? "era" : "fielding";

/** A `?stat=` that names a column of this group's table, else its default. */
/**
 * Which way a board that is already sorted actually runs, read off its own
 * values rather than declared per stat: MLB ranks most stats high to low but
 * ERA, WHIP and opponent average low to high, and a column has to know its
 * current direction to offer the opposite. Missing values are skipped, and a
 * board with nothing to compare — one row, all ties, all blank — reads as
 * descending, which is the common case and what MLB's default usually is.
 */
export const boardDir = (values: TeamStatValue[]): "asc" | "desc" => {
  const nums = values.map(teamStatNum).filter((n): n is number => n !== null);
  return nums.length > 1 && nums[nums.length - 1] > nums[0] ? "asc" : "desc";
};

/** The sort direction off the query string — anything else means MLB's own. */
export const pickLeaderOrder = (
  raw: string | undefined,
): "asc" | "desc" | undefined =>
  raw === "asc" || raw === "desc" ? raw : undefined;

export const pickLeaderStat = (
  raw: string | undefined,
  group: StatGroup,
): string =>
  playerCols(group).some((c) => c.key === raw)
    ? raw!
    : defaultLeaderStat(group);

/**
 * What a player has to do to appear at all — MLB's own rule, which the table
 * prints under itself so a missing name is explained rather than a mystery.
 */
export const QUALIFIER_NOTE: Record<StatGroup, string> = {
  hitting: "To qualify, a player must have at least 3.1 PA/game",
  pitching: "To qualify, a pitcher must have at least 1 IP/game",
  fielding: "Qualified fielders only — MLB's own pool at each position",
};

/**
 * Every club a season a trade split was played for — "MIN/HOU", the one the
 * player is on now last. The board's own payload names only that current club,
 * and a line reading HOU for fifty-one games says nothing about the
 * ninety-three before them.
 *
 * The per-club rows come back ordered by team id rather than by when they were
 * played, so `current` is what puts them in order: it is the club MLB reports
 * the player on, and the rest led it.
 */
async function tradedTeams(
  id: number,
  season: number,
  group: StatGroup,
  gameType: PlayerGameType,
  current: string,
): Promise<string | null> {
  const data = await mlb(
    `/people/${id}/stats?stats=season&group=${group}&season=${season}` +
      `&sportId=1&gameType=${gameType}&hydrate=team`,
    1800,
  );
  /* The payload leads with the combined line, which has no club of its own —
     the per-club rows are the ones that name a team. */
  const stops = ((data.stats?.[0]?.splits ?? []) as any[])
    .map((s) => s.team?.abbreviation)
    .filter((a): a is string => Boolean(a));
  if (stops.length < 2) return null;
  return [...stops.filter((a) => a !== current), current].join("/");
}

/**
 * The league's players in one group, ranked by one stat — the full board the
 * leader cards hand off to.
 *
 * The sort, the qualifying pool and the paging are all MLB's: ranking a page
 * of rows we already hold would rank the wrong 50 players. `limit` is what
 * MORE grows, so each press is one wider request rather than a stitched-
 * together list.
 */
export async function getStatLeaders({
  season,
  group,
  gameType = "R",
  stat,
  league = "all",
  position = "all",
  limit = 50,
  offset = 0,
  order,
}: {
  season: number;
  group: StatGroup;
  gameType?: PlayerGameType;
  stat: string;
  /** "103" / "104", or "all" for both. */
  league?: string;
  /** A position abbreviation, or "all". */
  position?: string;
  limit?: number;
  /** Rows already on screen — what a page beyond the first starts after. */
  offset?: number;
  /**
   * Numeric direction, overriding MLB's own. Left off, the board arrives the
   * way MLB ranks that stat — best first, which is descending for a counting
   * stat but ascending for ERA, WHIP and opponent average. Set it to the
   * opposite of what came back to read the board from the bottom.
   */
  order?: "asc" | "desc";
}): Promise<StatLeaderPage> {
  const data = await mlb(
    `/stats?stats=season&group=${group}&season=${season}&sportId=1` +
      `&gameType=${gameType}&playerPool=qualified&hydrate=team` +
      `&sortStat=${stat}&limit=${limit}&offset=${offset}` +
      (order ? `&order=${order}` : "") +
      (league === "all" ? "" : `&leagueId=${league}`) +
      (position === "all" ? "" : `&position=${position}`),
    1800,
  );
  const columns = playerCols(group);
  const board = data.stats?.[0];
  const splits = (board?.splits ?? []) as any[];
  const rows = splits.map(
    (s): StatLeaderRow => ({
      rank: s.rank ?? null,
      id: s.player?.id,
      name: s.player?.fullName ?? "—",
      position: s.position?.abbreviation ?? "",
      team: s.team?.abbreviation ?? "",
      teamId: s.team?.id ?? null,
      values: Object.fromEntries(
        columns.map((c) => [c.key, s.stat?.[c.key] ?? null]),
      ),
    }),
  );

  /* Only the handful a trade moved cost a request of their own, and a failed
     one leaves the club they finished the season on rather than no club. */
  await Promise.all(
    rows.map(async (r, i) => {
      if ((splits[i]?.numTeams ?? 1) < 2) return;
      const stops = await tradedTeams(
        r.id,
        season,
        group,
        gameType,
        r.team,
      ).catch(() => null);
      if (stops) r.team = stops;
    }),
  );

  return { total: board?.totalSplits ?? 0, rows };
}

/**
 * What the pitchers of record carried out of each game — the line the reader
 * sees beside a decision, "(1-0)" for a first win of the year rather than the
 * season total the pitcher finished with.
 *
 * MLB reports the as-of figure only inside a game's own box score, so it is
 * counted here instead: one league-wide schedule read names a winner, a loser
 * and a saver per game, and walking the season in order gives every pitcher's
 * running line without a request per row.
 */
export interface PitcherRecord {
  wins: number;
  losses: number;
  saves: number;
}

/** Records as they stood after each game, keyed `${gamePk}:${pitcherId}`. */
export function runningRecords(games: Game[]): Map<string, PitcherRecord> {
  const running = new Map<number, PitcherRecord>();
  const asOf = new Map<string, PitcherRecord>();
  for (const g of games) {
    for (const [role, key] of [
      ["winner", "wins"],
      ["loser", "losses"],
      ["save", "saves"],
    ] as const) {
      const p = g.decisions[role];
      if (!p) continue;
      const r = running.get(p.id) ?? { wins: 0, losses: 0, saves: 0 };
      r[key] += 1;
      running.set(p.id, r);
      asOf.set(`${g.pk}:${p.id}`, { ...r });
    }
  }
  return asOf;
}

export async function getPitcherRecords(
  season: number,
): Promise<Map<string, PitcherRecord>> {
  const data = await mlb(
    `/schedule?sportId=1&season=${season}&gameType=R,F,D,L,W&hydrate=decisions` +
      `&fields=dates,games,gamePk,gameDate,decisions,winner,loser,save,id,fullName`,
    1800,
  );
  return runningRecords(
    latestByGame(
      ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? []).map(toGame),
    ),
  );
}

/**
 * The All-Star Game, the seam a season is read in halves either side of. Null
 * for a season that never played one, which leaves the split to game count.
 */
export async function getBreakDate(season: number): Promise<string | null> {
  const data = await mlb(
    `/schedule?sportId=1&season=${season}&gameType=A&fields=dates,games,gameDate`,
    86400,
  );
  const g = ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? [])[0];
  return g?.gameDate ?? null;
}

/** Index of the first game after the break — where a season's halves part. */
export function breakIndex(games: Game[], breakAt: string | null): number {
  if (!breakAt) return Math.ceil(games.length / 2);
  const i = games.findIndex((g) => g.startTime > breakAt);
  return i === -1 ? games.length : i;
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
  /** Leave off anyone the club has since moved on from — a pre-game page is
   *  asking who is available tonight, not who led the season's ledger. */
  activeOnly = false,
): Promise<TeamLeaderBoard[]> {
  const [hitting, pitching, active] = await Promise.all([
    getTeamPlayerStats(id, season, "hitting", gameType),
    getTeamPlayerStats(id, season, "pitching", gameType),
    activeOnly ? getTeamRoster(id, season, "active") : [],
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

/** "2ND", "3RD", "11TH" — the rank line under a stat tile. */
export function ordinal(n: number): string {
  const tail = ["TH", "ST", "ND", "RD"];
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "TH" : (tail[n % 10] ?? "TH")}`;
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
const SPLIT_SECTIONS: {
  label: string;
  codes: string[];
  hittingOnly?: boolean;
}[] = [
  { label: "GAME", codes: ["h", "a", "d", "n", "g", "t"] },
  { label: "MONTH", codes: ["3", "4", "5", "6", "7", "8", "9", "10"] },
  { label: "HALF", codes: ["preas", "posas"] },
  { label: "OPPONENT", codes: ["vl", "vr", "val", "vnl"] },
  { label: "BASES", codes: ["r0", "ron", "risp", "risp2", "r123", "lo"] },
  { label: "SCORE", codes: ["sah", "sti", "sbh", "lc"] },
  { label: "RESULT", codes: ["twn", "tls", "taw", "tal"] },
  { label: "INNING", codes: ["ig01", "i07", "i08", "i09", "ix"] },
  { label: "COUNT", codes: ["fp", "ac", "ec", "bc", "2s", "fc"] },
  {
    label: "BATTING ORDER",
    hittingOnly: true,
    codes: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"],
  },
  {
    label: "POSITION",
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
async function buildSplits(
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
  for (const s of typed("statSplits") as any[]) {
    const code = s.split?.code ?? "";
    /* One code, one line: a club that changed leagues mid-season — or a
       player traded across one — can come back with the same code twice, and
       the first is the one on record. */
    if (code && !byCode.has(code))
      byCode.set(code, {
        code,
        label: (s.split?.description ?? "—").toUpperCase(),
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

  const total = (typed("season") as any[])[0];
  if (total && built.length > 0)
    built[0].lines.unshift({
      code: "total",
      label: "TOTAL",
      values: values(total.stat),
    });
  return built;
}

export async function getTeamSplits(
  id: number,
  season: number,
  group: "hitting" | "pitching",
): Promise<SplitSection[]> {
  return buildSplits(
    (codes) =>
      `/teams/${id}/stats?season=${season}&group=${group}&stats=season,statSplits&sitCodes=${codes}`,
    cols(group),
    SPLIT_SECTIONS.filter((s) => !s.hittingOnly || group === "hitting"),
  );
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
    return !!line && line.gs > 0 && line.gs * 2 >= line.g;
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

/* ── Pre-game ───────────────────────────────────────────────────────── */

/**
 * True until the first pitch — what the game page hangs its pre-game view off.
 * The abstract state alone won't do it: warmup reports as Live, having already
 * been handed a Top 1 linescore.
 */
export const notStarted = (g: Game): boolean =>
  g.state === "Preview" || g.detailedState === "Warmup";

/** One spot in a posted lineup, in batting order. */
export interface LineupSpot {
  id: number;
  name: string;
  pos: string;
}

/**
 * Everything about a game that only matters before it starts, off one
 * schedule read: the posted lineups, who is umpiring, what the weather is
 * doing, who is carrying it, and where the game sits in its series.
 */
export interface Pregame {
  weather: { condition: string; temp: string; wind: string } | null;
  /** Call signs, TV ahead of radio; MLB lists the same station once per club. */
  broadcasts: { type: string; name: string }[];
  officials: { role: string; name: string }[];
  /** Empty until the club posts the card, a couple of hours out. */
  away: LineupSpot[];
  home: LineupSpot[];
  /** "NYM leads 1-0" — MLB's own wording, once the series has a result. */
  series: { game: number; total: number; result: string } | null;
}

const PREGAME_HYDRATE =
  "weather,officials,broadcasts(all),lineups,seriesStatus";

const spot = (p: any): LineupSpot => ({
  id: p.id,
  name: p.fullName ?? "—",
  pos: p.primaryPosition?.abbreviation ?? "",
});

export async function getPregame(pk: number): Promise<Pregame | null> {
  const data = await mlb(
    `/schedule?sportId=1&gamePk=${pk}&hydrate=${PREGAME_HYDRATE}`,
    300,
  );
  const g = data.dates?.[0]?.games?.[0];
  if (!g) return null;

  const seen = new Set<string>();
  const w = g.weather;
  return {
    weather: w?.condition
      ? { condition: w.condition, temp: w.temp ?? "", wind: w.wind ?? "" }
      : null,
    broadcasts: ((g.broadcasts ?? []) as any[])
      .filter((b) => b.name && !seen.has(b.name) && seen.add(b.name))
      .sort((a, b) => Number(b.type === "TV") - Number(a.type === "TV"))
      .map((b) => ({ type: b.type ?? "", name: b.name })),
    officials: ((g.officials ?? []) as any[]).map((o) => ({
      role: o.officialType ?? "",
      name: o.official?.fullName ?? "—",
    })),
    away: ((g.lineups?.awayPlayers ?? []) as any[]).map(spot),
    home: ((g.lineups?.homePlayers ?? []) as any[]).map(spot),
    series: g.seriesStatus
      ? {
          game: g.seriesStatus.gameNumber ?? 0,
          total: g.seriesStatus.totalGames ?? 0,
          result: g.seriesStatus.result ?? "",
        }
      : null,
  };
}

/* ── The matchup ────────────────────────────────────────────────────── */

/**
 * The columns a lineup card shows, and the ones a career-against line and a
 * season line both carry — so the card's two modes fill the same table.
 */
export const LINEUP_COLS: TeamStatCol[] = [
  { key: "hAb", label: "H-AB", title: "Hits and at-bats" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "K", title: "Strikeouts" },
  { key: "avg", label: "AVG", title: "Batting average — hits per at-bat" },
  { key: "obp", label: "OBP", title: "On-base percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
];

/** A hitter's line as the card reads it, or null where there is no line. */
export type LineupLine = Record<string, TeamStatValue> | null;

/* Hits and at-bats read as one cell on a matchup line — "3-11", not two
   columns a reader has to divide themselves. */
const lineupLine = (stat: any): LineupLine =>
  stat
    ? {
        ...Object.fromEntries(
          LINEUP_COLS.map((c) => [c.key, stat[c.key] ?? null]),
        ),
        hAb: `${stat.hits ?? 0}-${stat.atBats ?? 0}`,
      }
    : null;

/**
 * Every listed hitter's career line against today's opposing starter.
 *
 * MLB answers this one batter at a time — there is no bulk form — so it is a
 * request per spot in the order, fired together. A career total against one
 * pitcher only moves when they next meet, so it caches for a day, and a
 * batter who has never faced him comes back as null rather than a row of
 * zeros.
 */
export async function getVsPitcher(
  batters: number[],
  pitcherId: number,
): Promise<Record<number, LineupLine>> {
  const lines = await Promise.all(
    batters.map((id) =>
      mlb(
        `/people/${id}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${pitcherId}`,
        86400,
      )
        .then((d) => {
          const splits = (d.stats?.[0]?.splits ?? []) as any[];
          const s = splits.find((x) => x.gameType === "R") ?? splits[0];
          return lineupLine(s?.stat);
        })
        .catch(() => null),
    ),
  );
  return Object.fromEntries(batters.map((id, i) => [id, lines[i]]));
}

/** A club's season line for each of its hitters, keyed by player id. */
export const lineupSeason = (
  rows: PlayerStatRow[],
): Record<number, LineupLine> =>
  Object.fromEntries(rows.map((r) => [r.id, lineupLine(r.values)]));

/*
 * Home field is worth about .535 across a season — the odds multiplier that
 * shifts an even matchup to that number.
 */
const HOME_FIELD_ODDS = 0.535 / 0.465;

/**
 * Pre-game win probability, from the two clubs' records alone: log5, the
 * standard way to turn two winning percentages into a head-to-head number,
 * tilted for home field. Null before either club has played.
 *
 * ponytail: records and home field only — no starters, no bullpen, no park.
 * A starter-aware number would need projections this API doesn't publish;
 * blend one in here if it ever does.
 */
export function winProbability(g: Game): { home: number; away: number } | null {
  const pct = (s: GameSide) => {
    const played = (s.wins ?? 0) + (s.losses ?? 0);
    return s.wins === null || played === 0 ? null : s.wins / played;
  };
  const h = pct(g.home);
  const a = pct(g.away);
  if (h === null || a === null) return null;

  const denom = h + a - 2 * h * a;
  /* Two unbeaten clubs, or two winless ones, log5 cannot separate. */
  const base =
    denom === 0 ? 0.5 : Math.min(0.99, Math.max(0.01, (h - h * a) / denom));
  const odds = (base / (1 - base)) * HOME_FIELD_ODDS;
  const home = odds / (1 + odds);
  return { home, away: 1 - home };
}

/** The games two clubs play each other, out of one of their schedules — the
 *  season series for free, since that schedule is already cached. */
export const headToHead = (schedule: Game[], oppId: number): Game[] =>
  schedule
    .filter((g) => g.away.id === oppId || g.home.id === oppId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

/*
 * Clubs play a series on consecutive days, so a gap of more than a day and a
 * half is where one series ends and the next begins. A doubleheader's two
 * games sit hours apart and stay together.
 *
 * ponytail: date proximity rather than a series id — MLB publishes the game's
 * number in its series but not which other games share it. A series split
 * around an off-day would read as two; use seriesGameNumber to stitch it if
 * that ever comes up.
 */
const SERIES_GAP_MS = 36 * 3600 * 1000;

export function seriesGames(matchups: Game[], pk: number): Game[] {
  const i = matchups.findIndex((g) => g.pk === pk);
  if (i < 0) return [];
  const at = (n: number) => new Date(matchups[n].startTime).getTime();
  let lo = i;
  let hi = i;
  while (lo > 0 && at(lo) - at(lo - 1) <= SERIES_GAP_MS) lo--;
  while (hi < matchups.length - 1 && at(hi + 1) - at(hi) <= SERIES_GAP_MS) hi++;
  return matchups.slice(lo, hi + 1);
}

/* ── Live game ──────────────────────────────────────────────────────── */

/** A game with a pitch actually being thrown — warmup is Live but isn't this. */
export const inProgress = (g: Game): boolean =>
  g.state === "Live" && !notStarted(g);

/** One pitch of the at-bat under way. */
export interface LivePitch {
  /** Its number in this at-bat — what the mark on the zone plot is labelled. */
  number: number;
  /** "FF", the code the pitch colours are keyed on. */
  code: string;
  name: string;
  /** "Strike Swinging", "Ball", "In play, run(s)". */
  call: string;
  speed: number | null;
  /** Feet from the middle of the plate and off the ground, catcher's view. */
  x: number | null;
  z: number | null;
  outcome: "ball" | "strike" | "in-play";
}

export interface AtBat {
  pitcher: { id: number; name: string } | null;
  /** "R" / "L". */
  hand: string;
  batter: { id: number; name: string } | null;
  side: string;
  balls: number;
  strikes: number;
  outs: number;
  pitches: LivePitch[];
  /** This batter's zone in feet — the box the marks are read against. */
  zoneTop: number;
  zoneBottom: number;
}

/** One completed at-bat: what happened, the score after it, and what it did
 *  to the home club's chances. */
export interface PlayProb {
  inning: number;
  /** "top" or "bottom". */
  half: string;
  description: string;
  awayScore: number;
  homeScore: number;
  /** The home club's chance after the play, 0–100. */
  homeProb: number;
  /** How far a home run carried, in feet — null on every other play. */
  distance: number | null;
}

export interface LiveGame {
  atBat: AtBat | null;
  onDeck: { id: number; name: string } | null;
  /** Who is standing on first, second and third — null for an empty bag. */
  bases: ({ id: number; name: string } | null)[];
  plays: PlayProb[];
}

/* The rulebook zone, for the rare pitch that arrives without the batter's own. */
const ZONE_TOP = 3.4;
const ZONE_BOTTOM = 1.6;

/* One at-bat's worth of pitches, and the play log the win-probability chart is
   drawn from. `fields` trims both hard: the untrimmed payloads carry a hot-cold
   zone breakdown per play and run to hundreds of kilobytes. */
const PLAY_FIELDS =
  "currentPlay,result,about,inning,halfInning,count,balls,strikes,outs,matchup," +
  "batter,pitcher,id,fullName,batSide,pitchHand,code,description,playEvents," +
  "details,call,type,isStrike,isBall,isInPlay,isPitch,pitchNumber,pitchData," +
  "startSpeed,strikeZoneTop,strikeZoneBottom,coordinates,pX,pZ";

const PROB_FIELDS =
  "about,inning,halfInning,result,description,awayScore,homeScore," +
  "homeTeamWinProbability,eventType,playEvents,hitData,totalDistance";

const livePerson = (p: any) =>
  p?.id ? { id: p.id, name: p.fullName ?? "—" } : null;

function livePitch(e: any): LivePitch {
  const d = e.details ?? {};
  const c = e.pitchData?.coordinates ?? {};
  return {
    number: e.pitchNumber ?? 0,
    code: d.type?.code ?? "",
    name: d.type?.description ?? "—",
    call: d.description ?? d.call?.description ?? "—",
    speed:
      typeof e.pitchData?.startSpeed === "number"
        ? e.pitchData.startSpeed
        : null,
    x: typeof c.pX === "number" ? c.pX : null,
    z: typeof c.pZ === "number" ? c.pZ : null,
    outcome: d.isInPlay ? "in-play" : d.isStrike ? "strike" : "ball",
  };
}

/**
 * The state of a game being played: the at-bat under way pitch by pitch, who
 * is on base and on deck, and every at-bat so far with what it did to the
 * home club's chances.
 *
 * Three small requests rather than the live feed, which is one request but a
 * quarter of a megabyte and climbing. Short revalidate — this is the part of
 * the page that has to keep up with the game.
 */
export async function getLive(pk: number): Promise<LiveGame> {
  const [play, line, prob] = await Promise.all([
    mlb(`/game/${pk}/playByPlay?fields=${PLAY_FIELDS}`, 15),
    mlb(`/game/${pk}/linescore`, 15),
    /* Win probability is the one MLB can be missing on a young game. */
    mlb(`/game/${pk}/winProbability?fields=${PROB_FIELDS}`, 15).catch(() => []),
  ]);

  const cur = play.currentPlay;
  const thrown = ((cur?.playEvents ?? []) as any[]).filter((e) => e.isPitch);
  /* Every pitch carries the zone as measured for this batter; the last one
     measured is the one the plot is drawn to. */
  const zone = thrown.at(-1)?.pitchData ?? {};
  const offense = line.offense ?? {};
  const defense = line.defense ?? {};
  /*
   * The line score is what is happening now; the play log keeps the at-bat
   * that just ended as its current one until the next batter steps in. So the
   * matchup is read off the line score — otherwise the panel pairs a batter
   * with the on-deck hitter from the other club between innings — and the
   * pitch sequence is shown only while the two agree on whose at-bat it is.
   */
  const batter = offense.batter ?? cur?.matchup?.batter;
  const current = !!batter && cur?.matchup?.batter?.id === batter.id;

  return {
    atBat: batter
      ? {
          pitcher: livePerson(defense.pitcher ?? cur?.matchup?.pitcher),
          hand: current ? (cur.matchup?.pitchHand?.code ?? "") : "",
          batter: livePerson(batter),
          side: current ? (cur.matchup?.batSide?.code ?? "") : "",
          balls: line.balls ?? 0,
          strikes: line.strikes ?? 0,
          outs: line.outs ?? 0,
          pitches: current ? thrown.map(livePitch) : [],
          zoneTop: zone.strikeZoneTop ?? ZONE_TOP,
          zoneBottom: zone.strikeZoneBottom ?? ZONE_BOTTOM,
        }
      : null,
    onDeck: livePerson(offense.onDeck),
    bases: [offense.first, offense.second, offense.third].map(livePerson),
    plays: ((prob ?? []) as any[]).map(
      (p): PlayProb => ({
        inning: p.about?.inning ?? 0,
        half: p.about?.halfInning ?? "",
        description: p.result?.description ?? "",
        awayScore: p.result?.awayScore ?? 0,
        homeScore: p.result?.homeScore ?? 0,
        homeProb: p.homeTeamWinProbability ?? 50,
        /* Only the ball that left the park gets its flight reported — every
           other batted ball has a distance too, and none of it is news. */
        distance:
          p.result?.eventType === "home_run"
            ? (((p.playEvents ?? []) as any[])
                .map((e) => e.hitData?.totalDistance)
                .find((d) => typeof d === "number") ?? null)
            : null,
      }),
    ),
  };
}

/* ── Hot and cold zones ─────────────────────────────────────────────── */

/** One cell of the batter's season, as MLB grades it. Zones "01"–"09" are the
 *  strike zone read left to right and top to bottom, "11"–"14" the four
 *  quadrants outside it. */
export interface HeatZone {
  zone: string;
  /** The average itself, ".312". */
  value: string;
  /** MLB's own grading: cold, cool, lukewarm, warm, hot. */
  temp: string;
}

/**
 * How a hitter has done by part of the zone this season — the shading behind
 * the live pitch plot.
 *
 * MLB grades every cell itself against the rest of the league, so the plot
 * takes its temperature rather than inventing a scale off thirteen numbers.
 * A hitter with too few swings comes back empty and the plot simply has no
 * shading; season-to-date figures move once a day, so this is cached for one
 * hour rather than on the live game's beat.
 */
export async function getHotZones(id: number): Promise<HeatZone[]> {
  const data = await mlb(
    `/people/${id}/stats?stats=hotColdZones&group=hitting&fields=stats,splits,stat,name,zones,zone,value,temp`,
    3600,
  ).catch(() => null);
  const splits = data?.stats?.[0]?.splits ?? [];
  const avg = (splits as any[]).find((s) => s.stat?.name === "battingAverage");
  return ((avg?.stat?.zones ?? []) as any[]).map(
    (z): HeatZone => ({ zone: z.zone, value: z.value, temp: z.temp }),
  );
}

/**
 * The plays that put a run on the board — read off the running score rather
 * than off MLB's own scoring-play list, which is a set of indexes into a
 * payload this page never asks for.
 */
export function scoringPlays(plays: PlayProb[]): PlayProb[] {
  return plays.filter((p, i) => {
    const before = plays[i - 1];
    return (
      p.awayScore !== (before?.awayScore ?? 0) ||
      p.homeScore !== (before?.homeScore ?? 0)
    );
  });
}

/** One half-inning of the play log, in the order it was played. */
export interface HalfInning {
  inning: number;
  half: string;
  /** Runs that crossed in this half — the score's own movement, either club. */
  runs: number;
  plays: PlayProb[];
}

/**
 * The play log cut into half-innings, so a play-by-play reads the way a
 * scorecard does rather than as one flat list of four hundred at-bats.
 */
export function halfInnings(plays: PlayProb[]): HalfInning[] {
  const out: HalfInning[] = [];
  plays.forEach((p, i) => {
    let half = out.at(-1);
    if (!half || half.inning !== p.inning || half.half !== p.half) {
      half = { inning: p.inning, half: p.half, runs: 0, plays: [] };
      out.push(half);
    }
    const before = plays[i - 1];
    half.runs +=
      p.awayScore -
      (before?.awayScore ?? 0) +
      (p.homeScore - (before?.homeScore ?? 0));
    half.plays.push(p);
  });
  return out;
}

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
const RATE_KEYS: Record<StatGroup, string[]> = {
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
  return {
    game: cols.filter((c) => !rates.has(c.key)),
    running: cols.filter((c) => rates.has(c.key)),
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
const SABER_FORMAT: Record<string, (n: number) => string> = {
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
async function leagueRates(
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
  /** The majors he won that season — empty on a split season's halves, which
   *  would otherwise print the same MVP twice under one year. */
  awards: PlayerAward[];
  values: Record<string, TeamStatValue>;
}

/**
 * Fills in the figures a summed line cannot get by adding — OPS+, ERA+, FIP —
 * from the seasons it covers. Built inside getPlayerCareer, where the league
 * lines and park factors are, and handed to whatever needs to write one.
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
  if (!postseason)
    for (const r of rows)
      if (!isSplitPart(rows, r))
        r.awards = lineAwards(awards.filter((a) => a.season === r.season));

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
    for (const r of rows) r.values[key] = plus(r.values, lineOf(r));

    /*
     * The same figures on a line that is several seasons added together — the
     * career, a club, a league. None of them can be summed: a plus stat is a
     * ratio to a league that changes every year, and FIP is a rate over
     * innings. Each is the seasons the line covers, blended by what he
     * actually did in them — a bat by its trips to the plate, an arm by its
     * outs, never by the club's or the league's playing time.
     */
    fillPlus = (values, from) => {
      const parts = from.map((r) => ({
        weight:
          group === "hitting"
            ? (teamStatNum(r.values.plateAppearances) ?? 0)
            : outsOf(r.values.inningsPitched),
        line: lineOf(r),
        values: r.values,
      }));
      const mean = (pick: (p: (typeof parts)[number]) => number | null) =>
        weightedMean(parts.map((p) => ({ weight: p.weight, value: pick(p) })));

      /* Each season's line is already parked, so the blend carries the parks
         he played in, in the proportion he played in them. */
      values[key] = plus(values, {
        obp: mean((p) => p.line?.obp ?? null) ?? 0,
        slg: mean((p) => p.line?.slg ?? null) ?? 0,
        era: mean((p) => p.line?.era ?? null) ?? 0,
      });
      if (group === "pitching") {
        const fip = mean((p) => teamStatNum(p.values.fip));
        values.fip = fip === null ? null : fip.toFixed(2);
      }
    };
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
const leagueAbbr = (id: number | undefined): string =>
  id === 103 ? "AL" : id === 104 ? "NL" : "";

const leagueIdOf = (abbr: string): number | null =>
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

/* ── Player splits ──────────────────────────────────────────────────── */

/* The recency codes only exist while a season is being played — a finished
   one has no "last 7 days" — so the section simply drops out of a past year.
   They lead the page because they are the first thing anyone asks of a bat. */
const PLAYER_SPLIT_SECTIONS = [
  { label: "RECENT", codes: ["d7", "d30", "l10"] },
  ...SPLIT_SECTIONS,
];

/** One player's season sliced every way MLB reports, section by section. */
export async function getPlayerSplits(
  id: number,
  season: number,
  group: "hitting" | "pitching",
): Promise<SplitSection[]> {
  return buildSplits(
    (codes) =>
      `/people/${id}/stats?stats=season,statSplits&group=${group}&season=${season}&sitCodes=${codes}`,
    playerCols(group),
    PLAYER_SPLIT_SECTIONS.filter((s) => !s.hittingOnly || group === "hitting"),
  );
}

/* ── Game log ───────────────────────────────────────────────────────── */

export interface GameLogRow {
  gamePk: number;
  /** "2026-09-02" — the date the game was played, as MLB dates it. */
  date: string;
  opp: { id: number; abbr: string } | null;
  home: boolean;
  /** "W 5-4", "L 13-12", "W 5-4 F/10" — blank if the score never arrived. */
  result: string;
  win: boolean | null;
  values: Record<string, TeamStatValue>;
  /** The season line through this game — what a log is read down for. */
  running: Record<string, TeamStatValue>;
}

/** One band of the log with its own total under it — a month, or, in
 *  October's log, a year. */
export interface GameLogGroup {
  label: string;
  /** Newest first, the way a log is read. */
  rows: GameLogRow[];
  total: Record<string, TeamStatValue>;
}

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/** How the game went for the club the player was on — "W 5-4", "L 3-2 F/11". */
function gameResult(g: Game | undefined, teamId: number): string {
  if (!g) return "";
  const us = g.home.id === teamId ? g.home : g.away;
  const them = g.home.id === teamId ? g.away : g.home;
  if (us.score === null || them.score === null || g.state !== "Final")
    return "";
  const mark = us.score > them.score ? "W" : us.score < them.score ? "L" : "T";
  const extra = g.inning && g.inning > 9 ? ` F/${g.inning}` : "";
  return `${mark} ${us.score}-${them.score}${extra}`;
}

/**
 * Every game a player appeared in, with each band's total under it and the
 * line to date on every row. A regular season is one year banded by month;
 * October is the whole career banded by year, since a post-season is only a
 * handful of games and is read against the ones before it.
 *
 * MLB's game log carries no score, only who won, so the clubs the player
 * appeared for have their schedules pulled alongside it and joined on the
 * game id — one extra request for a player who wasn't traded, and the same
 * payload the club's own schedule tab already caches.
 *
 * ponytail: the running line re-adds the whole prefix per game rather than
 * carrying an accumulator — a career of Octobers is still under two hundred
 * games. Carry one if a log ever covers every game of every season.
 */
export async function getPlayerGameLog(
  id: number,
  season: number,
  group: StatGroup,
  gameType: PlayerGameType = "R",
): Promise<GameLogGroup[]> {
  /* October is asked for as a career: the feed answers one season per
     `seasons=` entry, so the years he played are handed over at once. */
  const career = gameType === "P";
  const seasons = career
    ? await getPlayerSeasons(id).catch(() => [season])
    : [season];
  if (seasons.length === 0) return [];

  const data = await mlb(
    `/people/${id}/stats?stats=gameLog&group=${group}&seasons=${seasons.join(",")}` +
      `&gameType=${gameType}&sportId=1`,
    900,
  );
  const splits = ((data.stats?.[0]?.splits ?? []) as any[]).filter(
    (s) => s.game?.gamePk,
  );
  if (splits.length === 0) return [];

  const keys = statLineKeys(group);
  /* A schedule is a club's year, so a career-wide log needs one per club per
     season he played in it — a handful of requests, all already cached. */
  const clubs = [
    ...new Set(
      splits
        .filter((s) => s.team?.id)
        .map((s) => `${s.team.id}:${s.season ?? season}`),
    ),
  ];
  const schedules = await Promise.all(
    clubs.map((key) => {
      const [team, year] = key.split(":");
      return getTeamSchedule(Number(team), Number(year)).catch(
        () => [] as Game[],
      );
    }),
  );
  const byPk = new Map(schedules.flat().map((g) => [g.pk, g]));

  /* Oldest first while the running line is built, then flipped: a log is
     read newest first, but a total only accumulates one way. */
  const asc = [...splits].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const lines = asc.map((s) =>
    Object.fromEntries(keys.map((k) => [k, s.stat?.[k] ?? null])),
  );

  const rows: GameLogRow[] = asc.map((s, i) => {
    const g = byPk.get(s.game.gamePk);
    const oppId = s.opponent?.id ?? null;
    const oppSide = g && (g.home.id === oppId ? g.home : g.away);
    return {
      gamePk: s.game.gamePk,
      date: String(s.date ?? ""),
      opp: oppId
        ? { id: oppId, abbr: oppSide?.abbr ?? s.opponent?.name ?? "—" }
        : null,
      home: !!s.isHome,
      result: gameResult(g, s.team?.id),
      win: typeof s.isWin === "boolean" ? s.isWin : null,
      values: lines[i],
      running: sumStatLines(group, lines.slice(0, i + 1)),
    };
  });

  const bands = new Map<string, GameLogRow[]>();
  for (const r of rows) {
    const key = career
      ? r.date.slice(0, 4)
      : (MONTHS[Number(r.date.slice(5, 7)) - 1] ?? "SEASON");
    (bands.get(key) ?? bands.set(key, []).get(key)!).push(r);
  }
  return [...bands.entries()]
    .map(([label, bandRows]) => ({
      label,
      rows: [...bandRows].reverse(),
      total: sumStatLines(
        group,
        bandRows.map((r) => r.values),
      ),
    }))
    .reverse();
}

/* ── Biography ──────────────────────────────────────────────────────── */

/** One club a player has played for, and when — the career-history block. */
export interface CareerStop {
  teamId: number;
  team: string;
  from: string;
  to: string;
  seasons: number;
}

/** An award, folded together across the years it was won. */
export interface AwardGroup {
  /** MLB's id, so the bio line can point at the award's own page. */
  id: string;
  /** As printed — "AL Silver Slugger (RF)". */
  name: string;
  /** Where it sits among the majors; see MAJOR_AWARDS. */
  rank: number;
  seasons: string[];
}

export interface PlayerBio {
  birthDate: string;
  birthPlace: string;
  /** Where he was born, on its own — what says whether he could be drafted. */
  birthCountry: string;
  debut: string;
  draftYear: number | null;
  /** Which round and which pick overall, of the draft he actually signed out
   *  of — MLB reports every draft he was ever taken in. */
  draftRound: string;
  draftPick: number | null;
  active: boolean;
  position: string;
  stops: CareerStop[];
  awards: AwardGroup[];
}

/* The countries the draft covers. A player born anywhere else was signed as
   an international amateur free agent and has no draft year to print — MLB
   reports the absence and nothing more, so the birthplace is what tells the
   two apart. */
const DRAFT_COUNTRIES = new Set([
  "USA",
  "Canada",
  "Puerto Rico",
  "U.S. Virgin Islands",
  "American Samoa",
  "Guam",
]);

/** "DRAFTED 2013 · RD 1, PICK 32", "SIGNED INTERNATIONALLY", "UNDRAFTED". */
export const signingText = (bio: PlayerBio): string => {
  if (!bio.draftYear)
    return bio.birthCountry && !DRAFT_COUNTRIES.has(bio.birthCountry)
      ? "SIGNED INTERNATIONALLY"
      : "UNDRAFTED";
  /* Where the draft is on record but the pick isn't, the year alone is still
     worth printing — it is what every line had before this. */
  const where = [
    bio.draftRound && `RD ${bio.draftRound}`,
    bio.draftPick !== null && `PICK ${bio.draftPick}`,
  ].filter(Boolean);
  return `DRAFTED ${bio.draftYear}${where.length ? ` · ${where.join(", ")}` : ""}`;
};

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
const MAJOR_AWARDS: Record<
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
  ALSS: 3,
  NLSS: 3,
  ALGG: 4,
  NLGG: 4,
};

/** The awards a career line carries, in the order it writes them. */
export const lineAwards = (awards: PlayerAward[]): PlayerAward[] =>
  awards
    .filter((a) => a.id in LINE_AWARDS)
    .sort((a, b) => LINE_AWARDS[a.id] - LINE_AWARDS[b.id]);

/** Every award the app knows how to show a page for. */
export const isMajorAward = (id: string) => id in MAJOR_AWARDS;

/** "AL MVP" — the award's own name, for a page title or a bio line. */
export const awardLabel = (id: string) => MAJOR_AWARDS[id]?.label ?? id;

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

/** One player on an award's page: who he is, and the line he won it on. */
export interface AwardWinner {
  id: number;
  name: string;
  pos: string;
  team: string;
  teamId: number | null;
  league: string;
  /** Which of his groups this line is — a Cy Young page is pitching lines. */
  group: StatGroup;
  led: Record<string, LedScope>;
  values: Record<string, TeamStatValue>;
}

export interface AwardTable {
  id: string;
  label: string;
  season: string;
  /** The date MLB recorded it, "" where it has none. */
  date: string;
  winners: AwardWinner[];
}

/**
 * Everyone who took one award in one season, with the line each of them had.
 *
 * MLB publishes the winners and nothing else — there is no ballot in this
 * feed, so a page can say who won and how they played, but never who finished
 * second or by how many points. What it can say it says well: every winner's
 * season line, marked where it led the league or the majors, off the same
 * boards the career table's own marks come from.
 *
 * Three requests however many winners there are: the award, then one bulk
 * `personIds` call for all their season lines, then the leader boards.
 */
export async function getAwardTable(
  awardId: string,
  season: number,
): Promise<AwardTable | null> {
  if (!isMajorAward(awardId)) return null;
  const data = await mlb(
    `/awards/${awardId}/recipients?season=${season}`,
    86400,
  ).catch(() => null);
  const given = (data?.awards ?? []) as any[];
  const base: AwardTable = {
    id: awardId,
    label: awardLabel(awardId),
    season: String(season),
    date: given[0]?.date ?? "",
    winners: [],
  };
  if (given.length === 0) return base;

  const ids = [...new Set(given.map((a) => a.player?.id).filter(Boolean))];
  const people = await mlb(
    `/people?personIds=${ids.join(",")}&hydrate=` +
      encodeURIComponent(
        `stats(group=[hitting,pitching],type=[season],season=${season})`,
      ),
    86400,
  ).catch(() => null);

  const hitKeys = statLineKeys("hitting");
  const pitchKeys = statLineKeys("pitching");
  const winners: AwardWinner[] = [];
  for (const p of (people?.people ?? []) as any[]) {
    /* A pitcher is read by his pitching line and everyone else by his bat —
       which is also how a two-way player's award page reads, since MLB gives
       him both and the busier line is the one that won it. */
    const lines = (p.stats ?? []) as any[];
    const pick = (name: string) =>
      lines.find((s) => s.group?.displayName === name)?.splits?.[0];
    const pitching = pick("pitching");
    const hitting = pick("hitting");
    const isPitcher = p.primaryPosition?.abbreviation === "P";
    const split = (isPitcher ? pitching : hitting) ?? pitching ?? hitting;
    if (!split) continue;
    const group: StatGroup = split === pitching ? "pitching" : "hitting";
    const keys = group === "pitching" ? pitchKeys : hitKeys;
    winners.push({
      id: p.id,
      name: p.fullName ?? "",
      pos: p.primaryPosition?.abbreviation ?? "",
      team: split.team?.abbreviation ?? split.team?.name ?? "—",
      teamId: split.team?.id ?? null,
      league: leagueAbbr(split.league?.id),
      group,
      led: {},
      values: Object.fromEntries(keys.map((k) => [k, split.stat?.[k] ?? null])),
    });
  }

  /* One board per group actually on the page, and per league inside it. */
  const boards = new Map(
    await Promise.all(
      [...new Set(winners.map((w) => w.group))].map(
        async (g) =>
          [
            g,
            await seasonLeaders(season, g, [
              ...new Set(
                winners
                  .filter((w) => w.group === g)
                  .map((w) => leagueIdOf(w.league))
                  .filter((id): id is number => id !== null),
              ),
            ]).catch(() => new Map<string, string>()),
          ] as const,
      ),
    ),
  );
  for (const w of winners)
    w.led = ledMarks(
      w.group,
      w.values,
      boards.get(w.group) ?? new Map(),
      leagueIdOf(w.league),
    );

  return {
    ...base,
    /* A club's whole World Series roster comes back in no order at all; the
       busiest line first is the one a reader wants at the top. */
    winners: winners.sort(
      (a, b) =>
        (teamStatNum(b.values.plateAppearances ?? b.values.battersFaced) ?? 0) -
        (teamStatNum(a.values.plateAppearances ?? a.values.battersFaced) ?? 0),
    ),
  };
}

/** The 30 clubs' ids — what separates a major-league award from an A-ball one. */
async function mlbTeamIds(): Promise<Set<number>> {
  return new Set((await mlbTeams()).map((t) => t.id as number));
}

/**
 * Everything the bio tab prints that isn't already on the identity bar: where
 * the player came from, the clubs he has played for, and what he has won.
 *
 * The career stops are read off the season-by-season lines rather than a
 * transaction history, so a club he was traded to but never appeared for
 * doesn't show up as a season he played there. The highlights are the majors
 * only — see MAJOR_AWARDS — folded by name, so a four-time Silver Slugger is
 * one line with four years on it rather than four lines.
 */
export async function getPlayerBio(id: number): Promise<PlayerBio | null> {
  const [data, awards, hit, pitch] = await Promise.all([
    mlb(`/people/${id}?hydrate=draft`, 86400).catch((e: Error) => {
      if (e.message.includes(" 404:")) return null;
      throw e;
    }),
    getPlayerAwards(id).catch((): PlayerAward[] => []),
    getPlayerCareer(id, "hitting").catch(() => EMPTY_CAREER),
    getPlayerCareer(id, "pitching").catch(() => EMPTY_CAREER),
  ]);
  const p = data?.people?.[0];
  if (!p) return null;
  /* A player taken out of high school and again out of college has a draft
     on record for each; the one that counts is the one he signed, which is
     the year MLB reports as his. */
  const drafts = (p.drafts ?? []) as any[];
  const draft =
    drafts.find((d) => Number(d.year) === Number(p.draftYear)) ??
    drafts[drafts.length - 1];

  const stops = new Map<number, { team: string; years: Set<number> }>();
  for (const r of [...hit.rows, ...pitch.rows]) {
    if (r.teamId === null) continue;
    const seen =
      stops.get(r.teamId) ??
      stops
        .set(r.teamId, { team: r.teamName, years: new Set() })
        .get(r.teamId)!;
    seen.years.add(Number(r.season));
  }

  /* Folded by the name as printed, so "AL Silver Slugger (RF)" and the year
     he won it in left field stay the two separate lines they are. */
  const byName = new Map<
    string,
    { id: string; rank: number; years: string[] }
  >();
  for (const a of awards) {
    const seen =
      byName.get(a.label) ??
      byName.set(a.label, { id: a.id, rank: a.rank, years: [] }).get(a.label)!;
    if (!seen.years.includes(a.season)) seen.years.push(a.season);
  }

  return {
    birthDate: p.birthDate ?? "",
    birthPlace: [p.birthCity, p.birthStateProvince, p.birthCountry]
      .filter(Boolean)
      .join(", "),
    debut: p.mlbDebutDate ?? "",
    birthCountry: p.birthCountry ?? "",
    draftYear: p.draftYear ?? null,
    draftRound: draft?.pickRound ?? "",
    draftPick: teamStatNum(draft?.pickNumber),
    active: !!p.active,
    position: p.primaryPosition?.name ?? "",
    stops: [...stops.entries()]
      .map(([teamId, s]) => {
        const years = [...s.years].sort((a, b) => a - b);
        return {
          teamId,
          team: s.team,
          from: String(years[0]),
          to: String(years[years.length - 1]),
          seasons: years.length,
        };
      })
      /* Most recent club first — where he is now, then backwards. */
      .sort((a, b) => Number(b.to) - Number(a.to)),
    awards: [...byName.entries()]
      .map(([name, a]) => ({
        id: a.id,
        name,
        rank: a.rank,
        seasons: a.years.sort((x, y) => Number(y) - Number(x)),
      }))
      .sort(
        (a, b) =>
          a.rank - b.rank || Number(b.seasons[0]) - Number(a.seasons[0]),
      ),
  };
}
