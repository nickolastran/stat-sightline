/*
 * Self-check for the one piece of standings logic that isn't a straight field
 * read: the clinch symbol. MLB reports what a club clinched as a letter and
 * its elimination as two separate magic numbers, and every way of combining
 * them wrongly produced a real, wrong mark against a real season — a division
 * elimination read as a playoff elimination, a wild card overridden by it, a
 * tiebreaker loser left unmarked, a cancelled post-season invented.
 *
 * Run with:  npx tsx lib/mlb.check.ts
 */
import assert from "node:assert/strict";
import {
  boardDir,
  clinchMark,
  clinchPhase,
  clubCity,
  firstPitch,
  gameStatus,
  gamesBack,
  halfInnings,
  headToHead,
  inProgress,
  notStarted,
  scoringPlays,
  seriesGames,
  winProbability,
  breakIndex,
  latestByGame,
  leaderBoard,
  mergeFielding,
  eraPlus,
  opsPlus,
  parkFactorOf,
  signingText,
  sumStatLines,
  runningRecords,
  teamHref,
  teamIdOf,
  transactionMonths,
  ordinal,
  statRank,
  isSplitPart,
  wholeSeasonRow,
  type Game,
  type PlayerBio,
  type PlayerStatRow,
  type StandingRow,
  type PlayProb,
  type Transaction,
  type TeamStatRow,
  type CareerRow,
  type CareerTable,
} from "./mlb";

const row = (p: Partial<StandingRow>) =>
  ({ clinch: "", elim: "", wcElim: "", ...p }) as StandingRow;

/* Phase — what the payload as a whole can be trusted to say. */
const played = [row({ clinch: "z" }), row({})];
const blank = [row({}), row({})];
assert.equal(clinchPhase(played, false), "live", "2026, still being played");
assert.equal(clinchPhase(played, true), "settled", "2025, in the books");
assert.equal(clinchPhase(blank, true), "none", "1994, post-season cancelled");
assert.equal(clinchPhase(blank, false), "live", "spring training, in progress");

/* Letters, which mean the same thing in every phase. */
assert.equal(
  clinchMark(row({ clinch: "z" }), "live"),
  "*",
  "Blue Jays — best AL record",
);
assert.equal(
  clinchMark(row({ clinch: "y" }), "live"),
  "X",
  "Guardians — division",
);
assert.equal(
  clinchMark(row({ clinch: "w", elim: "E" }), "live"),
  "Y",
  "Tigers — wild card, division race lost",
);
assert.equal(
  clinchMark(row({ clinch: "x" }), "settled"),
  "Y",
  "2020's expanded field marks a berth 'x'",
);

/* Elimination, which does not. */
assert.equal(
  clinchMark(row({ elim: "E", wcElim: "E" }), "live"),
  "E",
  "Royals — out of both races",
);
assert.equal(
  clinchMark(row({ elim: "E", wcElim: "1" }), "live"),
  "",
  "Astros in September — division gone, wild card alive",
);
assert.equal(
  clinchMark(row({ elim: "E", wcElim: "1" }), "settled"),
  "E",
  "Astros in the books — the tiebreaker settled it, the magic number never moved",
);
assert.equal(clinchMark(row({}), "live"), "", "nothing decided yet");

/* A season with no post-season claims nothing about anyone. */
assert.equal(
  clinchMark(row({ elim: "E", wcElim: "E" }), "none"),
  "",
  "1994 — no October to be eliminated from",
);

/*
 * Games back, against MLB's own published 2026 American League figures — the
 * payload it computes for the regular season, and the one it leaves blank for
 * spring training.
 */
const club = (wins: number, losses: number) => row({ wins, losses });
const al = [
  club(77, 53), // Tampa Bay — league leader
  club(74, 56), // Yankees
  club(71, 59), // Red Sox
  club(68, 62), // White Sox
  club(65, 66), // Guardians
];
const gb = gamesBack(al);
assert.deepEqual(al.map(gb), [0, 3, 6, 9, 12.5], "matches leagueGamesBack");

// A club with a better margin but a lower percentage would go negative if the
// reference were picked on percentage — April, when games played differ.
const april = [club(10, 0), club(20, 5)];
assert.deepEqual(april.map(gamesBack(april)), [2.5, 0], "no negative figures");

// Two clubs level at the top are both level with the leader.
const tied = [club(65, 66), club(65, 66), club(62, 69)];
assert.deepEqual(
  tied.map(gamesBack(tied)),
  [0, 0, 3],
  "a tie leaves both at 0",
);

/*
 * First pitch in the viewer's zone. These cards are server-rendered, where the
 * default zone is the host's UTC — so the zone is an argument, and leaving it
 * off has to mean Eastern rather than whatever the machine happens to be set
 * to. Run this under TZ=UTC and TZ=Asia/Tokyo alike and it holds.
 */
const preview = {
  state: "Preview",
  detailedState: "Scheduled",
  startTime: "2026-08-25T02:40:00Z",
  inning: null,
  inningState: null,
} as Game;

assert.equal(gameStatus(preview).text, "10:40 PM EDT", "defaults to Eastern");
assert.equal(
  gameStatus(preview, "America/Los_Angeles").text,
  "7:40 PM PDT",
  "renders in the zone it is given",
);
assert.equal(gameStatus(preview).tone, "pre");

// A game under way or finished reports its state, not a clock.
const live = {
  ...preview,
  state: "Live",
  inning: 7,
  inningState: "Top",
} as Game;
assert.equal(
  gameStatus(live, "Asia/Tokyo").text,
  "TOP 7",
  "zone is irrelevant once it starts",
);
assert.equal(
  gameStatus({
    ...live,
    state: "Preview",
    inning: 1,
    detailedState: "Warmup",
  } as Game).text,
  "WARMUP",
  "warmup beats the Top 1 linescore it already carries",
);
assert.equal(
  gameStatus({ ...preview, state: "Final", inning: 10 } as Game).text,
  "SCHEDULED/10",
  "extra innings ride along with the final state",
);
assert.equal(
  firstPitch(preview.startTime, "America/Los_Angeles"),
  "7:40 PM PDT · MON, AUG 24, 2026",
  "a first pitch carries the day it falls on in the reader's own zone",
);

/*
 * What counts as not started yet. Warmup is the awkward one: MLB calls it Live
 * and hands it a first-inning linescore, but no pitch has been thrown.
 */
assert.equal(notStarted(preview), true);
assert.equal(notStarted({ ...live, detailedState: "Warmup" } as Game), true);
assert.equal(notStarted(live), false);
assert.equal(notStarted({ ...preview, state: "Final" } as Game), false);
assert.equal(
  inProgress({ ...live, detailedState: "In Progress" } as Game),
  true,
);
assert.equal(inProgress({ ...live, detailedState: "Warmup" } as Game), false);
assert.equal(inProgress(preview), false);

/*
 * The town a club is read by in a standings table. MLB's own locationName is
 * where the park is, not what the club is called, so the town is the name with
 * the club taken off the end — and one club has no town in its name at all.
 */
assert.equal(clubCity("Los Angeles Dodgers", "Dodgers"), "Los Angeles");
assert.equal(
  clubCity("Chicago White Sox", "White Sox"),
  "Chicago",
  "two-word clubs come off whole",
);
assert.equal(
  clubCity("Tampa Bay Rays", "Rays"),
  "Tampa Bay",
  "two-word towns survive",
);
assert.equal(
  clubCity("Athletics", "Athletics"),
  "Athletics",
  "the club with no town keeps its name",
);
assert.equal(
  clubCity("—", ""),
  "—",
  "a row with no club name falls back to the name",
);
console.log("clubCity ok");

/*
 * Which plays put a run up. MLB's own scoring-play list is a set of indexes
 * into a payload the page never asks for, so it is read off the running score
 * instead — including the very first play of a game, which has nothing before
 * it to compare against.
 */
const play = (awayScore: number, homeScore: number, description = "x") =>
  ({
    inning: 1,
    half: "top",
    description,
    awayScore,
    homeScore,
    homeProb: 50,
  }) as PlayProb;

assert.deepEqual(
  scoringPlays([play(0, 0), play(1, 0), play(1, 0), play(1, 2)]).map((p) => [
    p.awayScore,
    p.homeScore,
  ]),
  [
    [1, 0],
    [1, 2],
  ],
  "only the plays where the score moved",
);
assert.equal(
  scoringPlays([play(3, 0)]).length,
  1,
  "a game whose first logged play already scored still reports it",
);
assert.deepEqual(scoringPlays([play(0, 0)]), [], "0-0 is not a scoring play");
assert.deepEqual(scoringPlays([]), []);

/*
 * The same log cut into half-innings for the play-by-play. A half is a run of
 * plays sharing inning and side — extras mean the ninth is not the last, and
 * the runs per half are the score's own movement, whichever club moved it.
 */
const at = (
  inning: number,
  half: string,
  awayScore: number,
  homeScore: number,
) => ({ ...play(awayScore, homeScore), inning, half }) as PlayProb;

const halves = halfInnings([
  at(1, "top", 0, 0),
  at(1, "top", 2, 0),
  at(1, "bottom", 2, 0),
  at(2, "top", 2, 0),
  at(2, "bottom", 2, 3),
]);
assert.deepEqual(
  halves.map((h) => [h.inning, h.half, h.plays.length, h.runs]),
  [
    [1, "top", 2, 2],
    [1, "bottom", 1, 0],
    [2, "top", 1, 0],
    [2, "bottom", 1, 3],
  ],
  "one group per half, runs read off the score moving",
);
assert.deepEqual(
  halfInnings([at(9, "bottom", 1, 1), at(10, "top", 1, 1)]).map(
    (h) => h.inning,
  ),
  [9, 10],
  "extras open a new half rather than folding into the ninth",
);
assert.deepEqual(halfInnings([]), []);
console.log("halfInnings ok");

/*
 * Pre-game win probability. Log5 over two records, tilted for home field — so
 * two identical clubs are not 50/50, the home one is favoured, and the two
 * sides always add up to the whole.
 */
const record = (wins: number, losses: number) =>
  ({ wins, losses }) as Game["home"];
const odds = (h: [number, number], a: [number, number]) =>
  winProbability({ home: record(...h), away: record(...a) } as Game);

const even = odds([70, 70], [70, 70])!;
assert.ok(even.home > even.away, "home field breaks a tie between equal clubs");
assert.equal(even.home.toFixed(3), "0.535", "and is worth about .535");
assert.equal(
  (even.home + even.away).toFixed(6),
  "1.000000",
  "the two sides are the whole",
);

const strong = odds([100, 40], [40, 100])!;
assert.equal(
  strong.home.toFixed(2),
  "0.88",
  "a far better club at home is a heavy favourite",
);
assert.ok(
  odds([60, 80], [90, 50])!.away > 0.5,
  "a good enough road club still leads",
);
assert.equal(odds([0, 0], [0, 0]), null, "no record, no number");

/*
 * The season series out of one club's schedule, and the run of games that
 * makes up the series being played — consecutive days, doubleheaders included,
 * with the rest of the season's meetings left out of it.
 */
const meet = (pk: number, day: string) =>
  ({
    pk,
    startTime: `2026-0${day}T23:10:00Z`,
    state: "Final",
    away: { id: 121 },
    home: { id: 139 },
  }) as Game;

const schedule = [
  meet(1, "5-04"),
  /* A game against somebody else, in the middle of the season series. */
  { ...meet(2, "6-11"), home: { id: 147 } } as Game,
  meet(3, "8-30"),
  meet(4, "8-31"),
  meet(5, "9-01"),
];

assert.deepEqual(
  headToHead(schedule, 139).map((g) => g.pk),
  [1, 3, 4, 5],
  "only the games against that club, oldest first",
);
assert.deepEqual(
  seriesGames(headToHead(schedule, 139), 4).map((g) => g.pk),
  [3, 4, 5],
  "the series is the run of consecutive days around the game",
);
assert.deepEqual(
  seriesGames(headToHead(schedule, 139), 1).map((g) => g.pk),
  [1],
  "a one-game series stands alone",
);
assert.deepEqual(
  seriesGames(schedule, 99),
  [],
  "an unknown game has no series",
);

/*
 * Team stat ranks, the other figure the pages derive rather than read: MLB
 * publishes a club's runs but not where that puts it, and the two directions
 * (a low ERA leads, a low run total trails) share one function.
 */
const statClub = (id: number, runs: number | null, era: string | null) =>
  ({ id, name: `T${id}`, values: { runs, era } }) as TeamStatRow;
const clubs = [
  statClub(1, 718, "3.10"),
  statClub(2, 800, "4.00"),
  statClub(3, 718, "3.50"),
  statClub(4, 600, "5.00"),
  statClub(5, null, null), // hasn't played — no figure to rank
];

assert.equal(statRank(clubs, "runs", 2), 1, "most runs leads");
assert.equal(statRank(clubs, "runs", 1), 2, "tied clubs share the rank");
assert.equal(statRank(clubs, "runs", 3), 2, "…both of them");
assert.equal(
  statRank(clubs, "runs", 4),
  4,
  "a tie consumes the place behind it",
);
assert.equal(statRank(clubs, "era", 1, true), 1, "lowest ERA leads");
assert.equal(statRank(clubs, "era", 4, true), 4, "highest ERA trails");
assert.equal(statRank(clubs, "runs", 5), null, "no figure, no rank");
assert.equal(
  statRank(clubs, "era", 4),
  1,
  "read the wrong way round, the worst staff would lead — the direction is the caller's",
);
assert.equal(statRank(clubs, "runs", 99), null, "a club not in the table");

/*
 * Team leader boards, which rank from every player rather than the qualified
 * few — MLB's own team-leader endpoint answers a club whose rotation spent
 * the summer hurt with one name where three were asked for.
 */
const arm = (id: number, era: string, ip: number) =>
  ({
    id,
    name: `P${id}`,
    position: "P",
    values: { era, inningsPitched: ip },
  }) as PlayerStatRow;
const eraSpec = {
  key: "era",
  label: "ERA",
  group: "pitching" as const,
  low: true,
  min: { key: "inningsPitched", perGame: 1 },
};
const names = (b: ReturnType<typeof leaderBoard>) =>
  b.leaders.map((l) => [l.name, l.value]);

/* 100 team games, so 100 innings qualifies. */
assert.deepEqual(
  names(
    leaderBoard(
      eraSpec,
      [
        arm(1, "4.00", 120),
        arm(2, "3.00", 110),
        arm(3, "2.00", 105),
        arm(4, "1.00", 3),
      ],
      100,
    ),
  ),
  [
    ["P3", "2.00"],
    ["P2", "3.00"],
    ["P1", "4.00"],
  ],
  "three qualify, so the mop-up arm's 1.00 over three innings stays off the board",
);
assert.deepEqual(
  names(
    leaderBoard(
      eraSpec,
      [
        arm(1, "3.10", 152),
        arm(2, "3.06", 60),
        arm(3, "3.47", 55),
        arm(4, "0.00", 2),
      ],
      138,
    ),
  ),
  [
    ["P2", "3.06"],
    ["P1", "3.10"],
    ["P3", "3.47"],
  ],
  "one qualifier alone fills the board from the half bar, not from a two-inning shutout",
);
assert.deepEqual(
  names(leaderBoard(eraSpec, [arm(1, "5.00", 4), arm(2, "9.00", 1)], 138)),
  [
    ["P1", "5.00"],
    ["P2", "9.00"],
  ],
  "a board can only be as long as the staff",
);
assert.deepEqual(
  names(
    leaderBoard(
      { key: "homeRuns", label: "HR", group: "hitting" },
      [
        { id: 1, name: "P1", position: "", values: { homeRuns: 12 } },
        { id: 2, name: "P2", position: "", values: { homeRuns: 30 } },
        { id: 3, name: "P3", position: "", values: { homeRuns: null } },
      ],
      138,
    ),
  ),
  [
    ["P2", "30"],
    ["P1", "12"],
  ],
  "a counting stat needs no bar, and an unreported figure never ranks",
);

/* Club URLs carry the name for the reader and the id for the route. */
assert.equal(
  teamHref(137, "San Francisco Giants"),
  "/team/137-san-francisco-giants",
);
assert.equal(
  teamHref(120, "Washington Nationals", "roster"),
  "/team/120-washington-nationals/roster",
);
assert.equal(
  teamHref(146, "Miami Marlins/Florida"),
  "/team/146-miami-marlins-florida",
  "punctuation collapses to one hyphen, and never a trailing one",
);
assert.equal(
  teamHref(158, ""),
  "/team/158",
  "a nameless club still has a page",
);
assert.equal(teamIdOf("137-san-francisco-giants"), 137);
assert.equal(teamIdOf("137"), 137, "the bare id a bookmark still carries");
assert.ok(
  Number.isNaN(teamIdOf("san-francisco-giants")),
  "a name alone names no club",
);
assert.ok(Number.isNaN(teamIdOf("")), "and neither does nothing");

assert.equal(ordinal(1), "1ST");
assert.equal(ordinal(2), "2ND");
assert.equal(ordinal(3), "3RD");
assert.equal(ordinal(8), "8TH");
assert.equal(ordinal(11), "11TH", "the teens are all TH");
assert.equal(ordinal(12), "12TH");
assert.equal(ordinal(13), "13TH");
assert.equal(ordinal(21), "21ST");
assert.equal(ordinal(30), "30TH", "last in the majors");

/*
 * A season schedule, where a postponed game and its makeup are one gamePk on
 * two dates — 2026's Reds/Rangers April 4th, off MLB's own payload.
 */
const sched = (pk: number, startTime: string, state: string) =>
  ({ pk, startTime, state }) as Game;
const season = latestByGame([
  sched(824460, "2026-04-04T23:15:00Z", "Postponed"),
  sched(824664, "2026-06-21T18:20:00Z", "Postponed"),
  sched(824460, "2026-04-05T17:35:00Z", "Final"),
  sched(824700, "2026-09-27T17:20:00Z", "Scheduled"),
  sched(824664, "2026-08-06T22:40:00Z", "Final"),
]);
assert.deepEqual(
  season.map((g) => [g.pk, g.state]),
  [
    [824460, "Final"],
    [824664, "Final"],
    [824700, "Scheduled"],
  ],
  "the makeup replaces the rain-out, and the season stays in date order",
);
assert.deepEqual(
  latestByGame([sched(824424, "2026-06-14T17:40:00Z", "Postponed")]).map(
    (g) => g.state,
  ),
  ["Postponed"],
  "a postponement with no makeup yet is still a game on the schedule",
);

/*
 * Running pitcher lines — the figure beside a decision is what the pitcher
 * carried out of that game, not the season total, so the same name reads
 * (1-0) in March and (14-7) in September.
 */
const decided = (
  pk: number,
  startTime: string,
  winner: number | null,
  loser: number | null,
  save: number | null,
) =>
  ({
    pk,
    startTime,
    decisions: {
      winner: winner && { id: winner, name: `W${winner}` },
      loser: loser && { id: loser, name: `L${loser}` },
      save: save && { id: save, name: `S${save}` },
    },
  }) as Game;

const lines = runningRecords([
  decided(1, "2026-03-25T23:05:00Z", 425844, 657277, null),
  decided(2, "2026-03-26T23:05:00Z", 657277, 425844, 605280),
  decided(3, "2026-04-01T23:05:00Z", 425844, 111111, 605280),
  decided(4, "2026-04-02T23:05:00Z", null, null, null), // rained out, nobody decided
]);
assert.deepEqual(
  lines.get("1:425844"),
  { wins: 1, losses: 0, saves: 0 },
  "opening day win is (1-0), not the season total",
);
assert.deepEqual(
  lines.get("2:425844"),
  { wins: 1, losses: 1, saves: 0 },
  "the loss the next day lands on the same line",
);
assert.deepEqual(
  lines.get("3:425844"),
  { wins: 2, losses: 1, saves: 0 },
  "and the line keeps climbing through the season",
);
assert.deepEqual(
  lines.get("3:605280"),
  { wins: 0, losses: 0, saves: 2 },
  "saves are counted on their own",
);
assert.equal(
  lines.get("4:425844"),
  undefined,
  "a game with no decision has no line",
);

/*
 * Where the halves part — the All-Star break, so a club that played 95 before
 * it and 67 after still splits at the break rather than at game 81.
 */
const half = [
  sched(1, "2026-07-11T17:05:00Z", "Final"),
  sched(2, "2026-07-12T17:05:00Z", "Final"), // last one before the break
  sched(3, "2026-07-17T23:10:00Z", "Final"),
];
const allStar = "2026-07-15T00:00:00Z";
assert.equal(
  breakIndex(half, allStar),
  2,
  "the second half starts with the first game after the break",
);
assert.equal(
  breakIndex(half, "2026-11-01T00:00:00Z"),
  3,
  "a season played entirely before the break is all first half",
);
assert.equal(
  breakIndex(half, null),
  2,
  "no All-Star Game falls back to the midpoint",
);
assert.equal(
  breakIndex([], allStar),
  0,
  "a season with no games splits nowhere",
);

/*
 * The transaction log's shape — months, then days, then the day's moves in
 * one piece. A trade is filed once per player it moved, all of them carrying
 * the same sentence, which must not be read out twice.
 */
const move = (date: string, description: string, id = 1) =>
  ({
    id,
    date,
    description,
    type: "",
    personId: null,
    person: "",
  }) as Transaction;
const log = transactionMonths([
  move("2026-08-29", "Optioned RHP Spencer Bivens to Sacramento."),
  move("2026-08-26", "Placed RHP Adrian Houser on the 15-day injured list."),
  move("2026-08-26", "Selected the contract of RHP Braxton Roxby."),
  move("2026-07-31", "Traded OF Heliot Ramos to the Yankees.", 7),
  move("2026-07-31", "Traded OF Heliot Ramos to the Yankees.", 7),
]);
assert.deepEqual(
  log.map((m) => m.key),
  ["2026-08", "2026-07"],
  "months keep the order the moves arrived in, newest first",
);
assert.deepEqual(
  log[0].days.map((d) => d.date),
  ["2026-08-29", "2026-08-26"],
  "a month reads day by day",
);
assert.equal(
  log[0].days[1].notes.length,
  2,
  "a day carries every move made on it",
);
assert.deepEqual(
  log[1].days[0].notes,
  ["Traded OF Heliot Ramos to the Yankees."],
  "both sides of a trade are the same sentence, written once",
);

console.log("clinchMark ok");
console.log("gamesBack ok");
console.log("gameStatus ok");
console.log("winProbability ok");
console.log("seriesGames ok");
console.log("scoringPlays ok");
console.log("latestByGame ok");
console.log("runningRecords ok");
console.log("breakIndex ok");
console.log("transactionMonths ok");
console.log("leaderBoard ok");
console.log("teamHref ok");
console.log("statRank ok");
console.log("ordinal ok");

/* ── mergeFielding ──────────────────────────────────────────────────── */

const spot = (
  id: number,
  pos: string,
  innings: string,
  putOuts: number,
  assists: number,
  errors: number,
) => ({
  id,
  name: `F${id}`,
  position: pos,
  values: {
    games: 1,
    gamesStarted: 1,
    innings,
    putOuts,
    assists,
    errors,
    doublePlays: 0,
    chances: null,
  },
});

const merged = mergeFielding([
  spot(1, "SS", "100.2", 90, 200, 5),
  spot(1, "2B", "50.2", 30, 60, 1),
  spot(2, "C", "40.0", 300, 10, 2),
]);

assert.equal(merged.length, 2, "one row per player, not per position");
assert.equal(merged[0].position, "SS", "the most innings names the spot");
assert.equal(merged[1].position, "C");
assert.equal(
  merged[0].values.innings,
  "151.1",
  "innings add as thirds: 100.2 + 50.2 is 151.1, not 151.4",
);
assert.equal(merged[0].values.putOuts, 120);
assert.equal(
  merged[0].values.chances,
  386,
  "chances fall back to PO + A + E when unreported",
);
assert.equal(
  merged[0].values.fielding,
  ".984",
  "pct is recomputed from the totals, not averaged",
);
assert.equal(
  merged[0].values.rangeFactorPer9Inn,
  "22.60",
  "range factor is per nine, off the summed outs",
);
console.log("mergeFielding ok");

/* ── boardDir ───────────────────────────────────────────────────────── */
/*
 * The player board's second click has to reverse whatever MLB just handed
 * back, and MLB hands ERA back the other way round from home runs. The
 * direction is therefore read off the rows rather than declared per stat.
 */

assert.equal(boardDir([60, 56, 55, 40]), "desc", "most home runs first");
assert.equal(boardDir(["1.97", "2.21", "2.43"]), "asc", "lowest ERA first");
assert.equal(
  boardDir([".331", ".311", ".300"]),
  "desc",
  "rates read like any other number",
);
assert.equal(boardDir([3, 5, 5, 9]), "asc", "reversed board");
assert.equal(
  boardDir([null, 60, 55, null]),
  "desc",
  "blanks are skipped, not counted as zero",
);
assert.equal(
  boardDir([7, 7, 7]),
  "desc",
  "all ties fall back to MLB's usual order",
);
assert.equal(boardDir([42]), "desc", "one row has no direction to read");
assert.equal(boardDir([]), "desc", "nor does none");
assert.equal(
  boardDir(["121.2", "118.0"]),
  "desc",
  "innings compare as the numbers they print as",
);
console.log("boardDir ok");

/* ── sumStatLines ───────────────────────────────────────────────────── */
/*
 * The running line down a game log and the total under a month are the same
 * sum, and every way of getting it wrong is a number that looks plausible:
 * a mean of daily averages, an ERA off decimal innings, an OPS added from two
 * rounded rates.
 */

const batLine = (
  ab: number,
  h: number,
  tb: number,
  bb: number,
  hbp = 0,
  sf = 0,
) => ({
  atBats: ab,
  hits: h,
  totalBases: tb,
  baseOnBalls: bb,
  hitByPitch: hbp,
  sacFlies: sf,
  avg: ".000",
});

const batted = sumStatLines("hitting", [
  batLine(4, 2, 5, 1),
  batLine(4, 0, 0, 0),
  batLine(2, 1, 1, 1, 1, 1),
]);
assert.equal(batted.atBats, 10);
assert.equal(batted.hits, 3);
assert.equal(
  batted.avg,
  ".300",
  "average is the summed hits over the summed at-bats",
);
assert.equal(batted.slg, ".600", "6 total bases in 10 at-bats");
assert.equal(
  batted.obp,
  ".429",
  "walks, hit-by-pitch and sac flies all count in on-base: 6 of 14",
);
assert.equal(
  batted.ops,
  "1.029",
  "OPS is on-base plus slugging, worked out once from the totals",
);

const armLine = (
  ip: string,
  er: number,
  h: number,
  bb: number,
  k: number,
  ab: number,
) => ({
  inningsPitched: ip,
  earnedRuns: er,
  hits: h,
  baseOnBalls: bb,
  strikeOuts: k,
  atBats: ab,
  era: "0.00",
});

const pitched = sumStatLines("pitching", [
  armLine("6.2", 2, 5, 1, 8, 24),
  armLine("5.1", 1, 3, 2, 6, 19),
]);
assert.equal(
  pitched.inningsPitched,
  "12.0",
  "innings add as thirds: 6.2 + 5.1 is 12.0, not 11.3",
);
assert.equal(pitched.era, "2.25", "three earned runs over twelve innings");
assert.equal(
  pitched.whip,
  "0.92",
  "walks plus hits per inning, off the summed outs",
);
assert.equal(
  pitched.avg,
  ".186",
  "opponent average is hits over batters retired at the plate",
);
assert.equal(pitched.strikeoutsPer9Inn, "10.50");

/* WAR adds up across seasons, but it is the one decimal in a table of whole
   numbers: added as binary floats, eleven seasons of it end in a tail. */
const war = sumStatLines("hitting", [
  { war: "4.3" },
  { war: "2.1" },
  { war: "1.3" },
  { war: "2.8" },
]);
assert.equal(
  war.war,
  "10.5",
  "WAR is a counting stat and adds, written to the tenth it is quoted in",
);
assert.equal(
  sumStatLines("hitting", [{ war: null }]).war,
  undefined,
  "no WAR reported is no WAR shown",
);
assert.equal(
  sumStatLines("hitting", [{ opsPlus: "218" }]).opsPlus,
  undefined,
  "OPS+ is a rate against a league — left off a total, never added",
);

assert.equal(
  sumStatLines("hitting", []).avg,
  null,
  "no at-bats is no average, not .000",
);
assert.equal(
  sumStatLines("pitching", []).era,
  null,
  "and no innings is no ERA",
);
console.log("sumStatLines ok");

/* OPS+ — the one figure on the career line worked out here rather than read
   off a feed. Checked against Baseball-Reference's own for seasons whose
   park factor is near enough to one that the two should land together. */
const lg2024 = { obp: 0.3121, slg: 0.3992, era: 4.072 };
assert.equal(
  opsPlus({ obp: ".458", slg: ".701" }, lg2024),
  "222",
  "Judge 2024 — B-Ref has 218 with the park in it",
);
assert.equal(
  opsPlus({ obp: ".312", slg: ".399" }, lg2024),
  "100",
  "the league's own line is 100 by construction",
);
assert.equal(
  opsPlus({ obp: ".458", slg: ".701" }, null),
  null,
  "a season with no league line has no OPS+",
);
assert.equal(
  opsPlus({ obp: null, slg: ".701" }, lg2024),
  null,
  "and neither has a line with no on-base",
);
console.log("opsPlus ok");

/* ERA+ is the same idea the other way up — the league over the arm, so that
   higher is better and a plus is the right sign for it. */
assert.equal(
  eraPlus({ era: "4.07" }, lg2024),
  "100",
  "the league's own ERA is 100 by construction",
);
assert.equal(
  eraPlus({ era: "2.04" }, lg2024),
  "200",
  "half the league's earned runs is twice the league",
);
assert.equal(
  eraPlus({ era: "8.14" }, lg2024),
  "50",
  "and twice its earned runs is half",
);
assert.equal(
  eraPlus({ era: "0.00" }, lg2024),
  null,
  "a scoreless line has no ratio, not an infinite one",
);
assert.equal(
  eraPlus({ era: "3.00" }, null),
  null,
  "a season with no league line has no ERA+",
);
assert.equal(
  eraPlus({ era: "-.--" }, lg2024),
  null,
  "and neither has an arm that never pitched",
);
console.log("eraPlus ok");

/* How a player got into the game — MLB reports a draft year or nothing, and
   nothing means two different things depending on where he was born. */
const bio = (p: Partial<PlayerBio>) =>
  ({
    draftYear: null,
    birthCountry: "",
    draftRound: "",
    draftPick: null,
    ...p,
  }) as PlayerBio;
assert.equal(
  signingText(
    bio({
      draftYear: 2013,
      birthCountry: "USA",
      draftRound: "1",
      draftPick: 32,
    }),
  ),
  "DRAFTED 2013 · RD 1, PICK 32",
  "Judge — the 2013 first round, not the 2010 thirty-first",
);
assert.equal(
  signingText(
    bio({
      draftYear: 2011,
      birthCountry: "USA",
      draftRound: "5",
      draftPick: 172,
    }),
  ),
  "DRAFTED 2011 · RD 5, PICK 172",
  "Betts",
);
assert.equal(
  signingText(bio({ draftYear: 2013, birthCountry: "USA" })),
  "DRAFTED 2013",
  "a draft on record with no pick still prints the year",
);
assert.equal(
  signingText(bio({ birthCountry: "Dominican Republic" })),
  "SIGNED INTERNATIONALLY",
  "Soto — no draft covers him",
);
assert.equal(
  signingText(bio({ birthCountry: "Japan" })),
  "SIGNED INTERNATIONALLY",
  "Ohtani — posted, not drafted",
);
assert.equal(
  signingText(bio({ birthCountry: "Puerto Rico" })),
  "UNDRAFTED",
  "Puerto Rico is in the draft, so a missing year is a missing year",
);
assert.equal(signingText(bio({ birthCountry: "USA" })), "UNDRAFTED");
assert.equal(
  signingText(bio({})),
  "UNDRAFTED",
  "no birthplace either — the safer of the two",
);
console.log("signingText ok");

/* A park factor is the club's scoring at home against its scoring on the road,
   halved — a player only spends half a schedule in his own yard. */
assert.equal(
  parkFactorOf([]),
  1,
  "no home-and-road split on record is no adjustment",
);
assert.equal(
  parkFactorOf([1]),
  1,
  "a park that plays neutral leaves the line alone",
);
assert.equal(
  Number(parkFactorOf([1.32]).toFixed(3)),
  1.16,
  "Coors scoring a third again at home is worth 16 points, not 32",
);
assert.equal(
  Number(parkFactorOf([0.88]).toFixed(3)),
  0.94,
  "and a pitcher's park cuts the same way",
);
assert.equal(
  Number(parkFactorOf([1.4, 1.2, 1.3]).toFixed(3)),
  1.15,
  "the window is averaged before it is halved",
);
console.log("parkFactorOf ok");

/* The compare page reads a season as one row, but a season split by trade is
   several rows on the career table — the per-club halves and the combined
   line over them. Whichever one isn't a "part" is the season's whole line. */
const careerRow = (p: Partial<CareerRow>): CareerRow => ({
  season: "",
  team: "",
  teamName: "",
  teamId: null,
  age: null,
  league: "",
  teams: 1,
  led: {},
  values: {},
  ...p,
});
const splitRows = [
  careerRow({ season: "2021", teamId: 1, values: { h: 1 } }),
  careerRow({ season: "2022", teamId: 2, values: { h: 2 } }),
  careerRow({ season: "2022", teamId: 3, values: { h: 3 } }),
  careerRow({ season: "2022", teamId: null, teams: 2, values: { h: 5 } }),
];
const splitTable: CareerTable = { rows: splitRows, total: null, summaries: [] };

assert.equal(
  isSplitPart(splitRows, splitRows[1]),
  true,
  "a per-club line of a split season sits under the combined one",
);
assert.equal(
  isSplitPart(splitRows, splitRows[0]),
  false,
  "an ordinary season stands on its own",
);
assert.equal(
  isSplitPart(splitRows, splitRows[3]),
  false,
  "the combined line itself is not a part",
);
assert.equal(
  wholeSeasonRow(splitTable, 2021)?.values.h,
  1,
  "an ordinary season reads as its own line",
);
assert.equal(
  wholeSeasonRow(splitTable, 2022)?.values.h,
  5,
  "a split season reads as the combined line, not either club's half",
);
assert.equal(
  wholeSeasonRow(splitTable, 1999),
  null,
  "a season never played has no line to read",
);
console.log("wholeSeasonRow ok");
