/* The site-wide player and club search. */
import {
  DIVISION_ORDER,
  DIVISIONS,
  LEAGUES,
  mlb,
} from "./core";


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
export async function mlbTeams(): Promise<any[]> {
  const data = await mlb(`/teams?sportId=1`, 86400);
  return (data.teams ?? []) as any[];
}

/** One club, as the ABS org pickers list them: nickname, league, division. */
export interface Club {
  id: number;
  name: string;
  abbr: string;
  leagueId: number;
  division: string;
}

/**
 * The thirty clubs, in scoreboard order — east to west down each league.
 *
 * Only the pickers that name clubs by id use this, so it carries the nickname
 * rather than the full name: a checkbox grid of thirty "Los Angeles ..." reads
 * as one column of Los Angeles.
 */
export async function getClubs(): Promise<Club[]> {
  const teams = await mlbTeams();
  return teams
    .map((t) => ({
      id: t.id as number,
      name: (t.teamName ?? t.name ?? "") as string,
      abbr: (t.abbreviation ?? "") as string,
      leagueId: (t.league?.id ?? 0) as number,
      divisionId: (t.division?.id ?? 0) as number,
      division: DIVISIONS[t.division?.id] ?? "",
    }))
    .sort(
      (a, b) =>
        DIVISION_ORDER.indexOf(a.divisionId) -
          DIVISION_ORDER.indexOf(b.divisionId) || a.name.localeCompare(b.name),
    )
    .map(({ divisionId: _divisionId, ...club }): Club => club);
}

/**
 * Clubs and people matching what has been typed, clubs first.
 *
 * MLB's people search covers the whole of organised baseball, so a query lands
 * minor leaguers and long-retired players alongside the major leaguer almost
 * everyone means. Current major leaguers are floated to the top rather than
 * filtered out, since a search for a retired great should still find him.
 * `mlbOnly` drops anyone without a big-league debut — the compare page, where
 * a prospect with no MLB line has nothing to compare.
 */
export async function searchAll(q: string, limit = 8, mlbOnly = false): Promise<SearchHit[]> {
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
    .filter((p) => !mlbOnly || p.mlbDebutDate)
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
