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
