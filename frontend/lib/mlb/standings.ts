/* Division standings and the clinch / elimination marks on them. */
import {
  DIVISION_ORDER,
  DIVISIONS,
  LEAGUES,
  mlb,
} from "./core";


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
  /** The major-league club a minor-league affiliate belongs to; "" in the
   *  majors, where a club belongs to nobody. */
  org: string;
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

export function standingRow(t: any): StandingRow {
  const splits = t.records?.splitRecords;
  const divisionId = t.team?.division?.id;
  const leagueId = t.team?.league?.id;
  const name = t.team?.name ?? "—";
  return {
    id: t.team?.id,
    name,
    city: clubCity(name, t.team?.clubName ?? ""),
    divisionId,
    /* A minor league that plays without divisions names none on its clubs —
       its own name is what that group of them is. */
    division:
      DIVISIONS[divisionId] ??
      t.team?.division?.name ??
      t.team?.league?.name ??
      `DIV ${divisionId}`,
    leagueId,
    league: LEAGUES[leagueId] ?? t.team?.league?.name ?? `LEAGUE ${leagueId}`,
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
    org: t.team?.parentOrgName ?? "",
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
