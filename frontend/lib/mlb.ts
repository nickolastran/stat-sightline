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

/** Team logo — degrades to alt text if unreachable. */
export const teamLogo = (id: number) =>
  `https://www.mlbstatic.com/team-logos/${id}.svg`;

/** Today's date in America/New_York (MLB's game day), as YYYY-MM-DD. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

export const seasonOf = (isoDate: string) => Number(isoDate.slice(0, 4));

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

export async function getSchedule(date: string): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,team`,
    60
  );
  const games = data.dates?.[0]?.games ?? [];
  return games.map((g: any): Game => ({
    pk: g.gamePk,
    state: g.status?.abstractGameState ?? "Preview",
    detailedState: g.status?.detailedState ?? "",
    startTime: g.gameDate,
    venue: g.venue?.name ?? "",
    inning: g.linescore?.currentInning ?? null,
    inningState: g.linescore?.inningState ?? null,
    away: side(g.teams?.away ?? {}),
    home: side(g.teams?.home ?? {}),
  }));
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

export interface StandingRow {
  id: number;
  name: string;
  wins: number;
  losses: number;
  pct: string;
  gb: string;
  streak: string;
  divRank: string;
}

export interface Division {
  id: number;
  name: string;
  teams: StandingRow[];
}

export async function getStandings(season: number): Promise<Division[]> {
  const data = await mlb(
    `/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`,
    1800
  );
  const records = (data.records ?? []) as any[];
  return records
    .map((r): Division => ({
      id: r.division?.id,
      name: DIVISIONS[r.division?.id] ?? `DIV ${r.division?.id}`,
      teams: (r.teamRecords ?? []).map((t: any): StandingRow => ({
        id: t.team?.id,
        name: t.team?.name ?? "—",
        wins: t.wins ?? 0,
        losses: t.losses ?? 0,
        pct: t.winningPercentage ?? "—",
        gb: t.gamesBack ?? "-",
        streak: t.streak?.streakCode ?? "—",
        divRank: t.divisionRank ?? "—",
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  code: string;
  label: string;
  group: "hitting" | "pitching";
  leaders: LeaderRow[];
}

/** (category, statGroup, display label) for each board we surface. */
const LEADER_SPECS: { cat: string; group: "hitting" | "pitching"; label: string }[] = [
  { cat: "homeRuns", group: "hitting", label: "HOME RUNS" },
  { cat: "battingAverage", group: "hitting", label: "AVG" },
  { cat: "runsBattedIn", group: "hitting", label: "RBI" },
  { cat: "onBasePlusSlugging", group: "hitting", label: "OPS" },
  { cat: "stolenBases", group: "hitting", label: "STOLEN BASES" },
  { cat: "hits", group: "hitting", label: "HITS" },
  { cat: "earnedRunAverage", group: "pitching", label: "ERA" },
  { cat: "strikeouts", group: "pitching", label: "STRIKEOUTS" },
  { cat: "wins", group: "pitching", label: "WINS" },
  { cat: "saves", group: "pitching", label: "SAVES" },
  { cat: "whip", group: "pitching", label: "WHIP" },
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
    code: spec.cat,
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
  limit = 5
): Promise<Leaderboard[]> {
  return Promise.all(LEADER_SPECS.map((s) => oneBoard(s, season, limit)));
}
