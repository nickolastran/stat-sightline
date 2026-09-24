/* The awards pages: a season's ballots, one award all time, and the monthly ones. */
import {
  mlb,
  push,
} from "./core";
import {
  type TeamStatCol,
  teamStatNum,
  type TeamStatValue,
} from "./stats";
import {
  seasonWar,
} from "./teams";
import {
  mlbTeams,
} from "./search";
import {
  type StatGroup,
} from "./players";
import {
  AWARD_PAGE_LABEL,
  awardBallot,
  awardLabel,
  type AwardVote,
  CAREER_HITTING_COLS,
  CAREER_PITCHING_COLS,
  EMPTY_CAREER,
  eraPlus,
  getPlayerAwards,
  getPlayerCareer,
  leagueAbbr,
  leagueIdOf,
  leagueRates,
  ledMarks,
  type LedScope,
  MAJOR_AWARDS,
  type PlayerAward,
  SABER_FORMAT,
  seasonLeaders,
  statLineKeys,
  sumStatLines,
} from "./career";
import {
  type PlayerBio,
} from "./playerDetail";


/* ── A season's ballots ─────────────────────────────────────────────── */

/* What the voting tables print beside the votes. A ballot mixes hitters and
   arms, so an MVP or Rookie row carries both lines and leaves the half the
   player doesn't have blank — the reduced sets here are what a voting table
   shows rather than the whole career line, which would run off the page twice
   over. The Cy Young is arms only and takes the full pitching line. */
const pick = (cols: TeamStatCol[], keys: string[]): TeamStatCol[] =>
  keys.map((k) => cols.find((c) => c.key === k)!).filter(Boolean);

export const BALLOT_HITTING_COLS = pick(CAREER_HITTING_COLS, [
  "war",
  "gamesPlayed",
  "atBats",
  "runs",
  "hits",
  "homeRuns",
  "rbi",
  "stolenBases",
  "baseOnBalls",
  "avg",
  "obp",
  "slg",
  "ops",
]);

/** The Cy Young line: the whole arm, without the per-nine rates a vote is
    never argued on and which would push the table off the page. */
export const BALLOT_CY_COLS = pick(CAREER_PITCHING_COLS, [
  "war",
  "wins",
  "losses",
  "winPercentage",
  "era",
  "gamesPlayed",
  "gamesStarted",
  "gamesFinished",
  "completeGames",
  "shutouts",
  "saves",
  "inningsPitched",
  "hits",
  "runs",
  "earnedRuns",
  "homeRuns",
  "baseOnBalls",
  "intentionalWalks",
  "strikeOuts",
  "hitBatsmen",
  "balks",
  "wildPitches",
  "battersFaced",
  "whip",
  "eraPlus",
]);

export const BALLOT_PITCHING_COLS = pick(CAREER_PITCHING_COLS, [
  "wins",
  "losses",
  "era",
  "whip",
  "gamesPlayed",
  "gamesStarted",
  "saves",
  "inningsPitched",
  "hits",
  "homeRuns",
  "baseOnBalls",
  "strikeOuts",
]);

/** A manager's row: not a stat line at all, but his club's season. */
export const BALLOT_MANAGER_COLS: TeamStatCol[] = [
  { key: "w", label: "W", title: "Club wins" },
  { key: "l", label: "L", title: "Club losses" },
  { key: "pct", label: "W-L%", title: "Club winning percentage" },
  { key: "ties", label: "TIES", title: "Games that ended tied" },
  { key: "g", label: "G", title: "Games played" },
  { key: "finish", label: "FINISH", title: "Where the club finished in its division" },
];

/** One line of one voting table: the vote, and the season behind it. */
export interface BallotRow {
  vote: AwardVote;
  /** "—" until the player is resolved; a manager keeps his club's. */
  pos: string;
  team: string;
  teamId: number | null;
  league: string;
  /** Both lines, so one table can carry hitters and pitchers side by side. */
  hitting: Record<string, TeamStatValue> | null;
  pitching: Record<string, TeamStatValue> | null;
  /** Keyed "<group>:<stat>", since both halves have a G and an H. */
  led: Record<string, LedScope>;
}

export interface Ballot {
  award: string;
  label: string;
  /** Which columns the table carries beside the votes. */
  kind: "player" | "pitcher" | "manager";
  rows: BallotRow[];
}

/* The order a season's awards are read in — the two leagues of each award
   together, the way the vote is announced. */
const BALLOT_ORDER = [
  "ALMVP",
  "NLMVP",
  "ALCY",
  "NLCY",
  "ALROY",
  "NLROY",
  "ALMOY",
  "NLMOY",
];

/**
 * Every ballot of one season, with the line each man polled on.
 *
 * The whole year is one page, so the season lines are fetched once for all
 * eight ballots rather than per award: one `personIds` call for everyone who
 * drew a vote anywhere, one sabermetrics board per group for their WAR, and
 * the leader boards the bold marks come off. A manager needs none of it — his
 * club's record was scraped alongside his votes.
 */
export async function getSeasonBallots(season: number): Promise<Ballot[]> {
  const found = BALLOT_ORDER.map((award) => ({
    award,
    votes: awardBallot(award, season),
  })).filter((b) => b.votes.length > 0);
  if (found.length === 0) return [];

  const ids = [
    ...new Set(
      found.flatMap((b) => b.votes.map((v) => v.id).filter((i) => i !== null)),
    ),
  ] as number[];

  const [people, hitWar, pitchWar] = await Promise.all([
    ids.length > 0
      ? mlb(
          `/people?personIds=${ids.join(",")}&hydrate=` +
            encodeURIComponent(
              `stats(group=[hitting,pitching],type=[season],season=${season})`,
            ),
          86400,
        ).catch(() => null)
      : null,
    seasonWar(season, "hitting"),
    seasonWar(season, "pitching"),
  ]);

  const hitKeys = statLineKeys("hitting");
  const pitchKeys = statLineKeys("pitching");
  const line = (split: any, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, split.stat?.[k] ?? null]));

  /* A season split names its club but not always in three letters, and the
     column has room for nothing else. */
  const abbr = new Map(
    (await mlbTeams().catch(() => [])).map((t: any) => [t.id, t.abbreviation]),
  );

  const seen = new Map<number, BallotRow>();
  for (const p of (people?.people ?? []) as any[]) {
    const lines = (p.stats ?? []) as any[];
    const at = (name: string) =>
      lines.find((s) => s.group?.displayName === name)?.splits?.[0];
    const hit = at("hitting");
    const pitch = at("pitching");
    const where = hit ?? pitch;
    seen.set(p.id, {
      vote: null as unknown as AwardVote,
      pos: p.primaryPosition?.abbreviation ?? "",
      team:
        abbr.get(where?.team?.id) ??
        where?.team?.abbreviation ??
        where?.team?.name ??
        "—",
      teamId: where?.team?.id ?? null,
      league: leagueAbbr(where?.league?.id),
      /* A pitcher's own at-bats are not what he polled on, and a hitter's odd
         mop-up inning isn't either — a line is kept only where it is the
         reason he is on the ballot at all. */
      hitting: hit && !isArm(p, hit, pitch) ? line(hit, hitKeys) : null,
      pitching: pitch ? line(pitch, pitchKeys) : null,
      led: {},
    });
    /* WAR comes off the season's own board rather than a request per player —
       eight ballots is a hundred names, and the board is two calls. */
    const arm = isArm(p, hit, pitch);
    const war = (arm ? pitchWar : hitWar).player.get(p.id);
    const target = arm ? seen.get(p.id)!.pitching : seen.get(p.id)!.hitting;
    if (target && war !== undefined) target.war = SABER_FORMAT.war(war);
  }

  /* ERA+ is figured here off the season's league line, the way the career
     table figures it — the feed carries no such column.
     ponytail: unparked, so a figure is a few points off a park-adjusted one;
     weight it by parkFactor() if the difference ever matters. */
  const arms = await leagueRates(season, "pitching").catch(() => null);
  if (arms)
    for (const r of seen.values())
      if (r.pitching)
        r.pitching.eraPlus = eraPlus(r.pitching, arms.get(leagueIdOf(r.league)));

  /* One board per group and league actually on the page, for the marks that
     say a figure led something. */
  const leagues = [
    ...new Set(
      [...seen.values()]
        .map((r) => leagueIdOf(r.league))
        .filter((id): id is number => id !== null),
    ),
  ];
  const boards = new Map(
    await Promise.all(
      (["hitting", "pitching"] as const).map(
        async (g) =>
          [g, await seasonLeaders(season, g, leagues).catch(() => new Map())] as const,
      ),
    ),
  );
  for (const r of seen.values()) {
    const lg = leagueIdOf(r.league);
    if (r.hitting)
      for (const [k, v] of Object.entries(
        ledMarks("hitting", r.hitting, boards.get("hitting")!, lg),
      ))
        r.led[`hitting:${k}`] = v;
    if (r.pitching)
      for (const [k, v] of Object.entries(
        ledMarks("pitching", r.pitching, boards.get("pitching")!, lg),
      ))
        r.led[`pitching:${k}`] = v;
  }

  return found.map(({ award, votes }) => ({
    award,
    label: awardLabel(award),
    kind: award.endsWith("MOY")
      ? ("manager" as const)
      : award.endsWith("CY")
        ? ("pitcher" as const)
        : ("player" as const),
    rows: votes.map((vote) => {
      const found = vote.id === null ? undefined : seen.get(vote.id);
      return found
        ? { ...found, vote }
        : {
            vote,
            pos: "",
            team: vote.team ?? vote.club,
            teamId: vote.teamId ?? null,
            league: "",
            hitting: null,
            pitching: null,
            led: {},
          };
    }),
  }));
}

/** Whether the line he polled on is the one he threw. */
const isArm = (p: any, hit: any, pitch: any): boolean =>
  !!pitch && (p.primaryPosition?.abbreviation === "P" || !hit);

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
  if (!hasAwardPage(awardId)) return null;
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

/** Whether the app will draw a page for this award id. */
export const hasAwardPage = (id: string) =>
  id in MAJOR_AWARDS || id in AWARD_PAGE_LABEL;

/*
 * The ones handed out more than once a season. A season line beside a Player
 * of the Month is the wrong line — he won it on one April, not on the year —
 * so these are listed by season and left to each year's own page, which is
 * where the month is actually named.
 */
const PERIODIC_AWARDS = new Set([
  "ALPOM",
  "NLPOM",
  "ALPITOM",
  "NLPITOM",
  "ALROM",
  "NLROM",
  "ALRRELMON",
  "NLRRELMON",
  "DHLDMOM",
  "ALPOW",
  "NLPOW",
]);

/** One winner on the all-time page. Both lines rather than one, the way a
    ballot row carries them — a two-way winner won it on the pair. */
export interface AwardHistoryRow {
  id: number;
  name: string;
  pos: string;
  team: string;
  teamId: number | null;
  league: string;
  hitting: Record<string, TeamStatValue> | null;
  pitching: Record<string, TeamStatValue> | null;
}

/** Winners of one award in one season, as the all-time page stacks them. */
export interface AwardSeason {
  season: number;
  winners: AwardHistoryRow[];
  /** Whether a ballot was scraped for this one — an extra link if so. */
  ballot: boolean;
}

export interface AwardHistory {
  id: string;
  label: string;
  count: number;
  /** Newest first, and newest season first inside each. */
  decades: { decade: number; seasons: AwardSeason[] }[];
  /** False where the award has too many winners to name on one page — the
      decades are then lists of seasons rather than of players. */
  lines: boolean;
}

/*
 * Above this many names the page is a list rather than a table of lines.
 * Every All-Star since 1933 is over a thousand players and every World Series
 * winner nearly two, and a career apiece is thirty requests for columns that
 * a roster list was never going to be read across anyway.
 */
const AWARD_LINE_CAP = 400;

/** The columns the all-time page prints — the ballot's, less WAR, which is a
    board per season and ninety-odd of them for one page. */
export const awardHistoryCols = (group: StatGroup): TeamStatCol[] =>
  (group === "hitting" ? BALLOT_HITTING_COLS : BALLOT_PITCHING_COLS).filter(
    (c) => c.key !== "war",
  );

type YearSplit = { season?: string; team?: any; league?: any; stat?: any };

/** Every winner's season-by-season lines, both groups, in chunks small enough
    to stay inside the fetch cache's own limit. */
async function yearByYear(
  ids: number[],
): Promise<Map<number, { hitting: YearSplit[]; pitching: YearSplit[] }>> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
  const pages = await Promise.all(
    chunks.map((c) =>
      mlb(
        `/people?personIds=${c.join(",")}&hydrate=` +
          encodeURIComponent(
            "stats(group=[hitting,pitching],type=[yearByYear])",
          ),
        86400,
      ).catch(() => null),
    ),
  );
  const out = new Map<number, { hitting: YearSplit[]; pitching: YearSplit[] }>();
  for (const page of pages)
    for (const p of (page?.people ?? []) as any[]) {
      const at = { hitting: [] as YearSplit[], pitching: [] as YearSplit[] };
      for (const s of (p.stats ?? []) as any[]) {
        const g = s.group?.displayName;
        if (g === "hitting" || g === "pitching")
          at[g as "hitting" | "pitching"].push(...((s.splits ?? []) as YearSplit[]));
      }
      out.set(p.id, at);
    }
  return out;
}

/** The line he had that season — his own club's half of it where he was
    traded mid-year, since that is the club the award names. */
const splitAt = (
  list: YearSplit[],
  season: number,
  teamId: number | null,
): YearSplit | null => {
  const rows = list.filter((s) => Number(s.season) === season);
  return rows.find((s) => s.team?.id === teamId) ?? rows[0] ?? null;
};

/**
 * One award from its first season to its last — every winner, with the line
 * he won it on, grouped by decade.
 *
 * Two kinds of request however long the award has been given: the recipients
 * in one, then the winners' careers in chunks. The bold league-leading marks
 * the season pages carry are left off, since those are a leader board per
 * season and this page spans ninety of them.
 */
export async function getAwardHistory(
  awardId: string,
): Promise<AwardHistory | null> {
  if (!hasAwardPage(awardId)) return null;
  const data = await mlb(`/awards/${awardId}/recipients`, 86400).catch(
    () => null,
  );
  const given = ((data?.awards ?? []) as any[]).filter(
    (a) => a.player?.id && a.season,
  );
  const ids = [...new Set(given.map((a) => a.player.id as number))];
  const lines =
    ids.length > 0 &&
    ids.length <= AWARD_LINE_CAP &&
    !PERIODIC_AWARDS.has(awardId);

  const [careers, teams] = await Promise.all([
    lines
      ? yearByYear(ids)
      : new Map<number, { hitting: YearSplit[]; pitching: YearSplit[] }>(),
    mlbTeams().catch(() => []),
  ]);
  const abbr = new Map(teams.map((t: any) => [t.id, t.abbreviation as string]));

  const hitKeys = statLineKeys("hitting");
  const pitchKeys = statLineKeys("pitching");
  const bySeason = new Map<number, AwardHistoryRow[]>();
  const line = (split: YearSplit | null, keys: string[]) =>
    split ? Object.fromEntries(keys.map((k) => [k, split.stat?.[k] ?? null])) : null;

  for (const a of given) {
    const season = Number(a.season);
    /* An award given to whole rosters is a season list, not a name list: one
       decade of All-Stars is three hundred rows that say nothing a year's own
       page doesn't say better. */
    if (!lines) {
      if (!bySeason.has(season)) bySeason.set(season, []);
      continue;
    }
    const teamId: number | null = a.team?.id ?? null;
    const career = careers.get(a.player.id);
    /* Both halves, where he has both — a two-way winner's row is the pair,
       and a hitter's pitching half is simply blank. */
    const pitching = career ? splitAt(career.pitching, season, teamId) : null;
    const hitting = career ? splitAt(career.hitting, season, teamId) : null;
    const split = hitting ?? pitching;

    push(bySeason, season, {
      id: a.player.id,
      name: a.player.nameFirstLast ?? "",
      pos: a.player.primaryPosition?.abbreviation ?? "",
      team: split?.team?.abbreviation ?? abbr.get(teamId ?? -1) ?? "—",
      teamId: split?.team?.id ?? teamId,
      league: leagueAbbr(split?.league?.id),
      hitting: line(hitting, hitKeys),
      pitching: line(pitching, pitchKeys),
    });
  }

  const byDecade = new Map<number, AwardSeason[]>();
  for (const [season, winners] of [...bySeason].sort((a, b) => b[0] - a[0]))
    push(byDecade, Math.floor(season / 10) * 10, {
      season,
      winners,
      ballot: awardBallot(awardId, season).length > 0,
    });

  return {
    id: awardId,
    label: awardLabel(awardId),
    count: given.length,
    decades: [...byDecade]
      .sort((a, b) => b[0] - a[0])
      .map(([decade, seasons]) => ({ decade, seasons })),
    lines,
  };
}

/* ── The awards handed out monthly ──────────────────────────────────── */

/*
 * A monthly award is really one award given twice, and it is read as a pair:
 * who took the National League's April, who took the American League's. So
 * the two ids share a page, with a column each and the month between them,
 * rather than each getting a list of names with no month against them.
 */
const MONTHLY_PAIRS: { al: string; nl: string; label: string }[] = [
  { al: "ALPOM", nl: "NLPOM", label: "Players of the Month" },
  { al: "ALPITOM", nl: "NLPITOM", label: "Pitchers of the Month" },
  { al: "ALROM", nl: "NLROM", label: "Rookies of the Month" },
  { al: "ALRRELMON", nl: "NLRRELMON", label: "Relievers of the Month" },
];

/** The pair one monthly award id belongs to, or null for everything else. */
export const monthlyPair = (id: string) =>
  MONTHLY_PAIRS.find((p) => p.al === id || p.nl === id) ?? null;

export interface MonthlyWinner {
  id: number;
  name: string;
  team: string;
  teamId: number | null;
  /** Both, so a two-way winner reads the way he won it. Null where the month
      has no line of that kind — or no line at all, before MLB split them. */
  hitting: Record<string, TeamStatValue> | null;
  pitching: Record<string, TeamStatValue> | null;
}

export interface MonthlyRow {
  season: number;
  /** 4 through 9 — the month the award is for, not the date it was given. */
  month: number;
  al: MonthlyWinner | null;
  nl: MonthlyWinner | null;
}

export interface MonthlyAward {
  id: string;
  label: string;
  decades: { decade: number; rows: MonthlyRow[] }[];
}

export const MONTH_NAME = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/*
 * March belongs to April's award and October to September's — MLB's own
 * splits cut at the calendar, the award doesn't. Merging them is the same
 * arithmetic a season total is, so it is the same function.
 */
const MONTH_SPILL: Record<number, number> = { 3: 4, 10: 9 };

/**
 * One monthly award, both leagues, month by month back as far as it was
 * given — the two recipient lists, then the winners' month lines a season at
 * a time, which is the only grain MLB publishes them at.
 */
export async function getMonthlyAward(
  id: string,
): Promise<MonthlyAward | null> {
  const pair = monthlyPair(id);
  if (!pair) return null;

  const [alData, nlData, teams] = await Promise.all([
    mlb(`/awards/${pair.al}/recipients`, 86400).catch(() => null),
    mlb(`/awards/${pair.nl}/recipients`, 86400).catch(() => null),
    mlbTeams().catch(() => []),
  ]);
  const abbr = new Map(teams.map((t: any) => [t.id, t.abbreviation as string]));

  type Given = {
    season: number;
    month: number;
    side: "al" | "nl";
    id: number;
    name: string;
    teamId: number | null;
  };
  const given: Given[] = [];
  for (const [side, data] of [
    ["al", alData],
    ["nl", nlData],
  ] as const)
    for (const a of (data?.awards ?? []) as any[]) {
      /* The award is dated the last day of its month, so the date is the
         month — the season alone would put six winners on one row. */
      const month = Number(String(a.date ?? "").slice(5, 7));
      if (!a.player?.id || !a.season || !month) continue;
      given.push({
        season: Number(a.season),
        month: MONTH_SPILL[month] ?? month,
        side,
        id: a.player.id,
        name: a.player.nameFirstLast ?? "",
        teamId: a.team?.id ?? null,
      });
    }
  if (given.length === 0) return null;

  /* One request a season, a dozen seasons at a time: a month line only comes
     back season-scoped, and fifty of them at once is a rude way to ask. */
  const seasons = [...new Set(given.map((g) => g.season))].sort((a, b) => b - a);
  const lines = new Map<string, Record<string, TeamStatValue>>();
  const hitKeys = statLineKeys("hitting");
  const pitchKeys = statLineKeys("pitching");

  for (let i = 0; i < seasons.length; i += 12) {
    await Promise.all(
      seasons.slice(i, i + 12).map(async (season) => {
        const ids = [
          ...new Set(
            given.filter((g) => g.season === season).map((g) => g.id),
          ),
        ];
        const data = await mlb(
          `/people?personIds=${ids.join(",")}&hydrate=` +
            encodeURIComponent(
              `stats(group=[hitting,pitching],type=[byMonth],season=${season})`,
            ),
          86400,
        ).catch(() => null);
        for (const p of (data?.people ?? []) as any[])
          for (const st of (p.stats ?? []) as any[]) {
            const group = st.group?.displayName;
            if (group !== "hitting" && group !== "pitching") continue;
            const keys = group === "hitting" ? hitKeys : pitchKeys;
            /* Two calendar months can land on one award month, so a line is
               collected and then added rather than written straight in. */
            const at = new Map<number, Record<string, TeamStatValue>[]>();
            for (const sp of (st.splits ?? []) as any[]) {
              const m = MONTH_SPILL[sp.month] ?? sp.month;
              push(
                at,
                m,
                Object.fromEntries(keys.map((k) => [k, sp.stat?.[k] ?? null])),
              );
            }
            for (const [m, list] of at)
              lines.set(
                `${p.id}:${season}:${m}:${group}`,
                list.length === 1 ? list[0] : sumStatLines(group, list),
              );
          }
      }),
    );
  }

  const rows = new Map<string, MonthlyRow>();
  for (const g of given) {
    const key = `${g.season}:${g.month}`;
    const row: MonthlyRow =
      rows.get(key) ?? { season: g.season, month: g.month, al: null, nl: null };
    row[g.side] = {
      id: g.id,
      name: g.name,
      team: abbr.get(g.teamId ?? -1) ?? "—",
      teamId: g.teamId,
      hitting: lines.get(`${g.id}:${g.season}:${g.month}:hitting`) ?? null,
      pitching: lines.get(`${g.id}:${g.season}:${g.month}:pitching`) ?? null,
    };
    rows.set(key, row);
  }

  const byDecade = new Map<number, MonthlyRow[]>();
  for (const row of [...rows.values()].sort(
    (a, b) => b.season - a.season || b.month - a.month,
  ))
    push(byDecade, Math.floor(row.season / 10) * 10, row);

  return {
    id,
    label: pair.label,
    decades: [...byDecade]
      .sort((a, b) => b[0] - a[0])
      .map(([decade, rows]) => ({ decade, rows })),
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
