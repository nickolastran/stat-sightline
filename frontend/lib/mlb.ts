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

/** League id → display name. Fixed alongside the division ids above. */
const LEAGUES: Record<number, string> = {
  103: "AMERICAN LEAGUE",
  104: "NATIONAL LEAGUE",
};

/** Team logo — degrades to alt text if unreachable. */
export const teamLogo = (id: number) =>
  `https://www.mlbstatic.com/team-logos/${id}.svg`;

/**
 * Player headshot, square. MLB's own CDN answers with a generic silhouette
 * for anyone it has no photo of, so a missing headshot needs no fallback of
 * ours — every id returns an image.
 */
export const playerHeadshot = (id: number, size = 60) =>
  `https://midfield.mlbstatic.com/v1/people/${id}/spots/${size}`;

/** MLB's own live Gameday feed for a game — opened in its own tab. */
export const gamedayUrl = (pk: number) => `https://www.mlb.com/gameday/${pk}`;

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
}

function side(raw: any): GameSide {
  const t = raw.team ?? {};
  const pp = raw.probablePitcher;
  return {
    id: t.id,
    name: t.name ?? "TBD",
    abbr: t.abbreviation ?? "—",
    score: typeof raw.score === "number" ? raw.score : null,
    wins: raw.leagueRecord?.wins ?? null,
    losses: raw.leagueRecord?.losses ?? null,
    isWinner: !!raw.isWinner,
    probable: pp ? { id: pp.id, name: pp.fullName } : null,
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
});

const SCHEDULE_HYDRATE = "probablePitcher,linescore,team";

export async function getSchedule(date: string): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&date=${date}&hydrate=${SCHEDULE_HYDRATE}`,
    60
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
    60
  );
  const g = data.dates?.[0]?.games?.[0];
  return g ? toGame(g) : null;
}

/**
 * The one-line status a game shows everywhere: half-inning while live, the
 * detailed state once final, otherwise first pitch. `tone` picks the colour
 * without the caller re-deriving the state.
 *
 * First pitch is rendered in the viewer's own zone — no `timeZone` option, so
 * Intl falls back to the runtime default — and carries its abbreviation
 * ("7:05 PM PDT") so the number is never ambiguous. Only the client-side
 * scoreboard and box score call this, so "runtime" is the browser.
 */
export function gameStatus(g: Game): {
  text: string;
  tone: "live" | "final" | "pre";
} {
  if (g.state === "Live") {
    const half = g.inningState ? g.inningState.slice(0, 3).toUpperCase() : "";
    return { text: `${half} ${g.inning ?? ""}`.trim(), tone: "live" };
  }
  if (g.state === "Final")
    return { text: g.detailedState.toUpperCase(), tone: "final" };
  const t = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(g.startTime));
  return { text: t, tone: "pre" };
}

/* ── Box score ──────────────────────────────────────────────────────── */

export interface BoxBatter {
  id: number;
  name: string;
  pos: string;
  /** Entered mid-game — indented under the starter it replaced, savant-style. */
  sub: boolean;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  k: number;
  avg: string; // season, not game
  summary: string;
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
  batters: BoxBatter[];
  pitchers: BoxPitcher[];
}

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
    batters: (raw.batters ?? []).map((id: number): BoxBatter => {
      const p = at(id);
      const s = p.stats?.batting ?? {};
      return {
        id,
        name: p.person?.boxscoreName ?? p.person?.fullName ?? "—",
        pos: p.position?.abbreviation ?? "",
        sub: isSub(p.battingOrder),
        ab: s.atBats ?? 0,
        r: s.runs ?? 0,
        h: s.hits ?? 0,
        rbi: s.rbi ?? 0,
        bb: s.baseOnBalls ?? 0,
        k: s.strikeOuts ?? 0,
        avg: p.seasonStats?.batting?.avg ?? "—",
        summary: s.summary ?? "",
      };
    }),
    pitchers: (raw.pitchers ?? []).map((id: number): BoxPitcher => {
      const p = at(id);
      const s = p.stats?.pitching ?? {};
      return {
        id,
        name: p.person?.boxscoreName ?? p.person?.fullName ?? "—",
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
    innings: (line.innings ?? []).map((i: any): BoxInning => ({
      num: i.num,
      away: i.away?.runs ?? null,
      home: i.home?.runs ?? null,
    })),
    away: boxTeam(box.teams?.away ?? {}, line.teams?.away),
    home: boxTeam(box.teams?.home ?? {}, line.teams?.home),
  };
}

/* ── Standings ──────────────────────────────────────────────────────── */

/**
 * One club's line in the standings. Rank and games-back come in three
 * flavours because the standings page shows the same rows grouped three ways
 * (division / league / all MLB) — each scope reads its own pair, so a merged
 * table never shows a division-relative GB next to a league-wide field.
 * Every row carries its own division and league so it stays self-describing
 * once lifted out of its division table.
 */
export interface StandingRow {
  id: number;
  name: string;
  divisionId: number;
  division: string;
  leagueId: number;
  league: string;
  wins: number;
  losses: number;
  pct: string;
  gb: string;
  leagueGb: string;
  sportGb: string;
  divRank: string;
  leagueRank: string;
  sportRank: string;
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

export async function getStandings(season: number): Promise<Division[]> {
  // Hydrating the team gets full club names ("Tampa Bay Rays"); the bare
  // payload carries only the nickname ("Rays"), which reads as ambiguous once
  // rows are merged into a league-wide or all-MLB table.
  const data = await mlb(
    `/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`,
    1800
  );
  const records = (data.records ?? []) as any[];
  return records
    .map((r): Division => {
      const divisionId = r.division?.id;
      const leagueId = r.league?.id;
      const division = DIVISIONS[divisionId] ?? `DIV ${divisionId}`;
      const league = LEAGUES[leagueId] ?? `LEAGUE ${leagueId}`;
      return {
        id: divisionId,
        name: division,
        leagueId,
        league,
        teams: (r.teamRecords ?? []).map((t: any): StandingRow => {
          const splits = t.records?.splitRecords;
          return {
            id: t.team?.id,
            name: t.team?.name ?? "—",
            divisionId,
            division,
            leagueId,
            league,
            wins: t.wins ?? 0,
            losses: t.losses ?? 0,
            pct: t.winningPercentage ?? "—",
            gb: t.gamesBack ?? "-",
            leagueGb: t.leagueGamesBack ?? "-",
            sportGb: t.sportGamesBack ?? "-",
            divRank: t.divisionRank ?? "—",
            leagueRank: t.leagueRank ?? "—",
            sportRank: t.sportRank ?? "—",
            streak: t.streak?.streakCode ?? "—",
            runsScored: t.runsScored ?? 0,
            runsAllowed: t.runsAllowed ?? 0,
            runDiff: t.runDifferential ?? 0,
            last10: splitRecord(splits, "lastTen"),
            home: splitRecord(splits, "home"),
            away: splitRecord(splits, "away"),
            clinch: t.clinchIndicator ?? "",
          };
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Team statistics ────────────────────────────────────────────────── */

/** A single team stat cell. Strings arrive pre-formatted (".265", "3.47"). */
export type TeamStatValue = number | string | null;

export interface TeamStatCol {
  /** statsapi key inside the split's `stat` object. */
  key: string;
  label: string;
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
  { key: "gamesPlayed", label: "G" },
  { key: "runs", label: "R" },
  { key: "hits", label: "H" },
  { key: "homeRuns", label: "HR" },
  { key: "rbi", label: "RBI" },
  { key: "doubles", label: "2B" },
  { key: "triples", label: "3B" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "stolenBases", label: "SB" },
  { key: "avg", label: "AVG" },
  { key: "obp", label: "OBP" },
  { key: "slg", label: "SLG" },
  { key: "ops", label: "OPS" },
];

export const TEAM_PITCHING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "era", label: "ERA" },
  { key: "whip", label: "WHIP" },
  { key: "inningsPitched", label: "IP" },
  { key: "hits", label: "H" },
  { key: "runs", label: "R" },
  { key: "earnedRuns", label: "ER" },
  { key: "homeRuns", label: "HR" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "saves", label: "SV" },
  { key: "shutouts", label: "SHO" },
  { key: "avg", label: "OAVG" },
  { key: "strikeoutsPer9Inn", label: "K/9" },
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
  season: number
): Promise<TeamStatTable> {
  const data = await mlb(
    `/teams/stats?season=${season}&sportIds=1&group=${group}&stats=season`,
    1800
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
          columns.map((c) => [c.key, stat[c.key] ?? null])
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
export async function getTeamStats(season: number): Promise<TeamStatTable[]> {
  return Promise.all([
    teamStatTable("hitting", season),
    teamStatTable("pitching", season),
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
  season: number
): Promise<TeamIdentity | null> {
  const data = await mlb(`/teams/${id}?season=${season}`, 1800).catch(
    (e: Error) => {
      if (e.message.includes(" 404:")) return null;
      throw e;
    }
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
  season: number
): Promise<StandingRow | null> {
  const divisions = await getStandings(season);
  return divisions.flatMap((d) => d.teams).find((r) => r.id === id) ?? null;
}

/** One club's season lines, off the same payload the team-stats section uses. */
export async function getTeamLines(
  id: number,
  season: number
): Promise<{ hitting: TeamStatRow | null; pitching: TeamStatRow | null }> {
  const stats = await getTeamStats(season);
  const lineFor = (group: "hitting" | "pitching") =>
    stats.find((s) => s.group === group)?.rows.find((r) => r.id === id) ?? null;
  return { hitting: lineFor("hitting"), pitching: lineFor("pitching") };
}

/** One club's roster. Degrades to an empty list — the rest of the page stands. */
export async function getTeamRoster(
  id: number,
  season: number
): Promise<RosterEntry[]> {
  const data = await mlb(
    `/teams/${id}/roster?season=${season}&rosterType=fullSeason`,
    1800
  ).catch(() => null);
  return ((data?.roster ?? []) as any[]).map((r): RosterEntry => ({
    id: r.person?.id,
    name: r.person?.fullName ?? "—",
    number: r.jerseyNumber ?? "",
    pos: r.position?.abbreviation ?? "",
    posType: r.position?.type ?? "Other",
    status: r.status?.description ?? "",
  }));
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
  leaders: LeaderRow[];
}

/**
 * (category, statGroup, display label) for each board we surface, in the
 * order they fill the grid. WAR has no place here — the StatsAPI publishes
 * no such leader category, since the figure is a third-party derivation
 * (bWAR, fWAR) rather than an official MLB stat.
 */
const LEADER_SPECS: { cat: string; group: "hitting" | "pitching"; label: string }[] = [
  { cat: "battingAverage", group: "hitting", label: "AVG" },
  { cat: "onBasePlusSlugging", group: "hitting", label: "OPS" },
  { cat: "hits", group: "hitting", label: "HITS" },
  { cat: "doubles", group: "hitting", label: "DOUBLES" },
  { cat: "triples", group: "hitting", label: "TRIPLES" },
  { cat: "homeRuns", group: "hitting", label: "HOME RUNS" },
  { cat: "runsBattedIn", group: "hitting", label: "RBI" },
  { cat: "strikeouts", group: "hitting", label: "STRIKEOUTS" },
  { cat: "walks", group: "hitting", label: "WALKS" },
  { cat: "stolenBases", group: "hitting", label: "STOLEN BASES" },
  { cat: "earnedRunAverage", group: "pitching", label: "ERA" },
  { cat: "wins", group: "pitching", label: "WINS" },
  { cat: "losses", group: "pitching", label: "LOSSES" },
  { cat: "inningsPitched", group: "pitching", label: "INNINGS PITCHED" },
  { cat: "strikeouts", group: "pitching", label: "STRIKEOUTS" },
  { cat: "walks", group: "pitching", label: "WALKS" },
  { cat: "earnedRun", group: "pitching", label: "EARNED RUNS" },
  { cat: "whip", group: "pitching", label: "WHIP" },
  { cat: "saves", group: "pitching", label: "SAVES" },
];

async function oneBoard(
  spec: (typeof LEADER_SPECS)[number],
  season: number,
  limit: number
): Promise<Leaderboard> {
  const data = await mlb(
    `/stats/leaders?leaderCategories=${spec.cat}&statGroup=${spec.group}&season=${season}&sportId=1&limit=${limit}`,
    1800
  );
  const leaders = (data.leagueLeaders?.[0]?.leaders ?? []) as any[];
  return {
    code: `${spec.group}.${spec.cat}`,
    label: spec.label,
    group: spec.group,
    leaders: leaders.map((l): LeaderRow => ({
      rank: l.rank,
      personId: l.person?.id,
      name: l.person?.fullName ?? "—",
      team: l.team?.name ?? "",
      value: l.value,
    })),
  };
}

export async function getLeaderboards(
  season: number,
  limit = 20
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
  season: number
): Promise<PlayerSummary | null> {
  const data = await mlb(
    `/people/${id}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`,
    1800
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
    86400
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
