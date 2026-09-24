/* A player's splits, game log, and biography. */
import {
  mlb,
  MONTHS,
  seasonOf,
  todayPT,
} from "./core";
import {
  teamStatNum,
  type TeamStatValue,
} from "./stats";
import {
  type Game,
  gameStatus,
} from "./schedule";
import {
  buildSplits,
  getTeamSchedule,
  SPLIT_SECTIONS,
  type SplitLine,
  type SplitSection,
} from "./teams";
import {
  getPlayerSeasons,
  inningsOf,
  outsOf,
  playerCols,
  type PlayerGameType,
  type StatGroup,
} from "./players";
import {
  RATE_KEYS,
  statLineKeys,
  sumStatLines,
} from "./career";


/* ── Player splits ──────────────────────────────────────────────────── */

/* The recency codes only exist while a season is being played — a finished
   one has no "last 7 days" — so the section simply drops out of a past year.
   They lead the page because they are the first thing anyone asks of a bat. */
const PLAYER_SPLIT_SECTIONS = [
  { label: "Recent", codes: ["d7", "d30", "l10"] },
  ...SPLIT_SECTIONS,
];

/**
 * The splits an overview leads with, in reading order: recent form, the two
 * sides of the schedule with the one he plays next first, then who he is
 * about to face — the opponent himself for a bat, and either way the league
 * he'll see — the hands he has hit or pitched against, and the month being
 * played.
 *
 * Codes the season can't answer simply don't come back, so an out-of-season
 * month or a club with nothing scheduled costs a row rather than the panel.
 */
export function overviewSplitCodes(
  group: "hitting" | "pitching",
  next: { home: boolean; leagueId: number } | null,
  /** Today, so the month being played names itself. */
  date: string = todayPT(),
): string[] {
  const sides = next?.home === false ? ["a", "h"] : ["h", "a"];
  /* MLB codes a month by its number — March is "3", October "10". */
  const month = String(Number(date.slice(5, 7)));
  return [
    "d7",
    ...sides,
    ...(group === "hitting" ? [VS_TEAM_CODE] : []),
    ...(next?.leagueId === 103 ? ["val"] : next?.leagueId === 104 ? ["vnl"] : []),
    ...(group === "hitting" ? ["vl", "vr"] : []),
    month,
  ];
}

/**
 * The last seven days, added up off the game log.
 *
 * MLB publishes a `d7` situation code and has stopped answering it — every
 * player comes back with no recency splits at all — so recent form, which is
 * the first thing anyone asks of a bat, is counted from the games themselves.
 * The log is already on the overview, so this costs no request.
 */
export function lastSevenDays(
  group: StatGroup,
  months: GameLogGroup[],
  today: string = todayPT(),
): SplitLine | null {
  const from = new Date(Date.parse(today) - 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  const rows = months.flatMap((m) => m.rows).filter((r) => r.date >= from);
  return rows.length === 0
    ? null
    : {
        code: "d7",
        label: "Last 7 Days",
        values: sumStatLines(group, rows.map((r) => r.values)),
      };
}

/** The synthetic code the vs-club line is filed under — MLB has none. */
export const VS_TEAM_CODE = "vsteam";

/**
 * How much of a club's season is still to be played, as a multiplier on a
 * line: 162/151 in the middle of September, 1 once the schedule has run out.
 * Only the regular season is counted, so October's bracket never reads as
 * games a batting line still has coming.
 *
 * A season that isn't the one being played has nothing left to project, and
 * answers 1 rather than a figure that would only restate the line.
 */
export async function seasonPace(
  teamId: number | null,
  season: number,
  today: string = todayPT(),
): Promise<number> {
  if (!teamId || season !== seasonOf(today)) return 1;
  const games = await getTeamSchedule(teamId, season, "R").catch(
    () => [] as Game[],
  );
  const played = games.filter((g) => g.state === "Final").length;
  return played > 0 && games.length > played ? games.length / played : 1;
}

/**
 * A season line carried to the end of the schedule at the pace it was set —
 * "on pace for", the way a counting column is read in September.
 *
 * Only the counts are scaled; every rate is worked out again from them, so
 * the projected line adds up the way the real one does. The pace is the
 * club's, not the player's: a line is projected over the games his club has
 * left, which is what a reader means by "if he keeps this up".
 */
export function projectStatLine(
  group: StatGroup,
  values: Record<string, TeamStatValue>,
  pace: number,
): Record<string, TeamStatValue> {
  const rates = new Set(RATE_KEYS[group]);
  const innKey =
    group === "pitching"
      ? "inningsPitched"
      : group === "fielding"
        ? "innings"
        : "";
  const scaled: Record<string, TeamStatValue> = {};
  for (const k of statLineKeys(group)) {
    if (rates.has(k) || k === innKey) continue;
    const n = teamStatNum(values[k]);
    if (n === null) continue;
    /* WAR is a counting stat that is written to a tenth; everything else a
       line counts is a whole thing that happened. */
    scaled[k] =
      k === "war" ? Math.round(n * pace * 10) / 10 : Math.round(n * pace);
  }
  if (innKey) scaled[innKey] = inningsOf(Math.round(outsOf(values[innKey]) * pace));
  return sumStatLines(group, [scaled]);
}

/**
 * A player's season against one club. MLB reports this under a stat type of
 * its own rather than a situation code, so it is fetched on its own and
 * handed back in the same shape the coded splits arrive in.
 */
export async function getVsTeamSplit(
  id: number,
  season: number,
  group: "hitting" | "pitching",
  opponent: { id: number; abbr: string },
): Promise<SplitLine | null> {
  const data = await mlb(
    `/people/${id}/stats?stats=vsTeamTotal&group=${group}&season=${season}` +
      `&opposingTeamId=${opponent.id}`,
    1800,
  ).catch(() => null);
  const split = (data?.stats?.[0]?.splits ?? [])[0];
  if (!split?.stat) return null;
  return {
    code: VS_TEAM_CODE,
    label: `vs ${opponent.abbr}`,
    values: Object.fromEntries(
      playerCols(group).map((c) => [c.key, split.stat[c.key] ?? null]),
    ),
  };
}

/**
 * One player's season sliced every way MLB reports, section by section — or
 * his whole career, which MLB answers for on the same codes under a different
 * pair of type names. A career has no "last 7 days", so that section goes.
 */
export async function getPlayerSplits(
  id: number,
  season: number | "career",
  group: "hitting" | "pitching",
): Promise<SplitSection[]> {
  const career = season === "career";
  return buildSplits(
    (codes) =>
      career
        ? `/people/${id}/stats?stats=career,careerStatSplits&group=${group}&sitCodes=${codes}`
        : `/people/${id}/stats?stats=season,statSplits&group=${group}&season=${season}&sitCodes=${codes}`,
    playerCols(group),
    (career ? SPLIT_SECTIONS : PLAYER_SPLIT_SECTIONS).filter(
      (s) => !s.hittingOnly || group === "hitting",
    ),
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
  /** Being played right now, which is why it has no result to print yet. */
  live: boolean;
  win: boolean | null;
  /** Which round of October this was — "" in a regular-season log. */
  series: SeriesCode | "";
  values: Record<string, TeamStatValue>;
  /** The season line through this game — what a log is read down for. */
  running: Record<string, TeamStatValue>;
}

/** MLB's game types for the four rounds, in the order they are played. */
export type SeriesCode = "F" | "D" | "L" | "W";

const SERIES: { code: SeriesCode; label: string }[] = [
  { code: "F", label: "WILD CARD" },
  { code: "D", label: "DIVISION SERIES" },
  { code: "L", label: "LEAGUE CHAMPIONSHIP SERIES" },
  { code: "W", label: "WORLD SERIES" },
];

const seriesLabel = (code: string): string =>
  SERIES.find((s) => s.code === code)?.label ?? "POSTSEASON";

/**
 * A career of Octobers added up one round at a time — what a post-season log
 * is read for once the games themselves have been read. Rounds he never
 * reached are left out rather than printed as a line of zeroes.
 */
export function seriesTotals(
  group: StatGroup,
  bands: GameLogGroup[],
): { label: string; values: Record<string, TeamStatValue> }[] {
  const rows = bands.flatMap((b) => b.rows);
  return SERIES.map(({ code, label }) => ({
    label,
    lines: rows.filter((r) => r.series === code).map((r) => r.values),
  }))
    .filter((s) => s.lines.length > 0)
    .map(({ label, lines }) => ({ label, values: sumStatLines(group, lines) }));
}

/** One band of the log with its own total under it — a month, or, in
 *  October's log, a year. */
export interface GameLogGroup {
  label: string;
  /** Newest first, the way a log is read. */
  rows: GameLogRow[];
}

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
      /* A game still being played has a line but no result — the log says so
         the way the schedule does rather than printing an empty cell. */
      live: !!g && gameStatus(g).tone === "live",
      win: typeof s.isWin === "boolean" ? s.isWin : null,
      series: career ? (s.gameType ?? "") : "",
      values: lines[i],
      running: sumStatLines(group, lines.slice(0, i + 1)),
    };
  });

  const bands = new Map<string, GameLogRow[]>();
  for (const r of rows) {
    /* October is banded by the round, not the month — which series a game
       belongs to is the only thing that orders a post-season log. */
    const key = career
      ? `${r.date.slice(0, 4)} · ${seriesLabel(r.series)}`
      : (MONTHS[Number(r.date.slice(5, 7)) - 1] ?? "SEASON");
    (bands.get(key) ?? bands.set(key, []).get(key)!).push(r);
  }
  return [...bands.entries()]
    .map(([label, bandRows]) => ({ label, rows: [...bandRows].reverse() }))
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
