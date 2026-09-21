/*
 * The minor leagues, off the same StatsAPI feeds the majors are read from.
 *
 * Every level is one `sportId` — Triple-A is 11 where the majors are 1 — so
 * nothing here is a second client onto MLB: standings, team lines and the
 * player board are the major-league helpers with a different number in the
 * query, which is what lets the same tables render all of it.
 *
 * The two things the majors never have to say are the level a club plays at
 * and the organisation it belongs to. The first is a control; the second
 * rides along on the standing row, since a minor-league table without the
 * parent club is a list of towns.
 */
import {
  mlb,
  standingRow,
  playerCols,
  type Division,
  type StatLeaderRow,
  type StatGroup,
} from "@/lib/mlb";

/** The levels, deepest first — the order a system is talked through. */
export const MINOR_LEVELS = [
  { value: "aaa", label: "TRIPLE-A", sportId: 11 },
  { value: "aa", label: "DOUBLE-A", sportId: 12 },
  { value: "high-a", label: "HIGH-A", sportId: 13 },
  { value: "single-a", label: "SINGLE-A", sportId: 14 },
  { value: "rookie", label: "ROOKIE", sportId: 16 },
] as const;

export type MinorLevel = (typeof MINOR_LEVELS)[number];

/** Anything unrecognised reads as Triple-A, the level with the most eyes on it. */
export const pickLevel = (raw: string | undefined): MinorLevel =>
  MINOR_LEVELS.find((l) => l.value === raw) ?? MINOR_LEVELS[0];

/**
 * How far back the minor-league feeds are worth offering. MLB took the minors
 * onto this API with the 2021 reorganisation — the affiliations, the league
 * names and the levels themselves are all different on either side of it, so
 * a season before it would be answered by a table nobody could read.
 */
export const MINORS_FIRST_SEASON = 2021;

/** The leagues at one level this season — the defunct ones the endpoint also
 *  carries (two American Associations, one of them 1962) are dropped. */
export async function getMinorLeagues(
  sportId: number,
  season: number,
): Promise<{ id: number; name: string }[]> {
  const data = await mlb(`/league?sportId=${sportId}&season=${season}`, 86400);
  return ((data.leagues ?? []) as any[])
    .filter((l) => l.active)
    .map((l) => ({ id: l.id as number, name: (l.name as string) ?? "—" }));
}

/**
 * One level's standings, a division at a time.
 *
 * The payload groups by division but names neither it nor the league — both
 * arrive only on the hydrated club, which is also where the parent
 * organisation comes from. A league that plays without divisions (the
 * Northwest League) leaves the field off its clubs entirely and falls back to
 * its own name.
 *
 * Split from the fetch so the fallbacks can be checked against a payload
 * without one — see lib/minors.check.ts.
 */
export function minorDivisions(records: any[]): Division[] {
  return records
    .map((r): Division => {
      const club = r.teamRecords?.[0]?.team;
      const league = club?.league?.name ?? "—";
      return {
        id: r.division?.id ?? r.league?.id ?? 0,
        name: (club?.division?.name ?? league).toUpperCase(),
        leagueId: r.league?.id ?? 0,
        league: league.toUpperCase(),
        teams: (r.teamRecords ?? []).map(standingRow),
      };
    })
    .filter((d) => d.teams.length > 0)
    .sort(
      (a, b) =>
        a.league.localeCompare(b.league) || a.name.localeCompare(b.name),
    );
}

export async function getMinorStandings(
  sportId: number,
  season: number,
): Promise<Division[]> {
  const leagues = await getMinorLeagues(sportId, season);
  if (leagues.length === 0) return [];
  const data = await mlb(
    `/standings?leagueId=${leagues.map((l) => l.id).join(",")}` +
      `&season=${season}&standingsTypes=regularSeason&hydrate=team`,
    1800,
  );
  return minorDivisions((data.records ?? []) as any[]);
}

/**
 * One level's players, ranked by one column.
 *
 * MLB does the ranking, the same trade the major-league board makes: sorting
 * a page of rows already held would rank the wrong fifty players. The pool is
 * the qualified one wherever MLB publishes a qualifier for it — fielding has
 * none, and asking for it there answers with nobody.
 */
export async function getMinorPlayers({
  sportId,
  season,
  group,
  stat,
  limit = 50,
}: {
  sportId: number;
  season: number;
  group: StatGroup;
  stat: string;
  limit?: number;
}): Promise<{ rows: StatLeaderRow[]; total: number }> {
  const data = await mlb(
    `/stats?stats=season&group=${group}&season=${season}&sportId=${sportId}` +
      `&playerPool=${group === "fielding" ? "all" : "qualified"}` +
      `&sortStat=${stat}&limit=${limit}&hydrate=team`,
    1800,
  );
  const board = data.stats?.[0];
  const columns = playerCols(group);
  return {
    total: board?.totalSplits ?? 0,
    rows: ((board?.splits ?? []) as any[]).map(
      (s, i): StatLeaderRow => ({
        rank: s.rank ?? i + 1,
        id: s.player?.id,
        name: s.player?.fullName ?? "—",
        position: s.position?.abbreviation ?? "",
        team: s.team?.abbreviation ?? s.team?.name ?? "",
        teamId: s.team?.id ?? null,
        teams: s.numTeams ?? 1,
        values: Object.fromEntries(
          columns.map((c) => [c.key, s.stat?.[c.key] ?? null]),
        ),
      }),
    ),
  };
}

/** The column a board opens on, and the guard on a hand-typed `?stat=`. */
export const pickMinorStat = (
  raw: string | undefined,
  group: StatGroup,
): string => {
  const columns = playerCols(group);
  if (columns.some((c) => c.key === raw)) return raw!;
  return group === "hitting"
    ? "homeRuns"
    : group === "pitching"
      ? "era"
      : "fielding";
};
