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
  clinchMark,
  clinchPhase,
  gameStatus,
  gamesBack,
  latestByGame,
  leaderBoard,
  teamHref,
  teamIdOf,
  ordinal,
  statRank,
  type Game,
  type PlayerStatRow,
  type StandingRow,
  type TeamStatRow,
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
assert.equal(clinchMark(row({ clinch: "z" }), "live"), "*", "Blue Jays — best AL record");
assert.equal(clinchMark(row({ clinch: "y" }), "live"), "X", "Guardians — division");
assert.equal(clinchMark(row({ clinch: "w", elim: "E" }), "live"), "Y", "Tigers — wild card, division race lost");
assert.equal(clinchMark(row({ clinch: "x" }), "settled"), "Y", "2020's expanded field marks a berth 'x'");

/* Elimination, which does not. */
assert.equal(clinchMark(row({ elim: "E", wcElim: "E" }), "live"), "E", "Royals — out of both races");
assert.equal(clinchMark(row({ elim: "E", wcElim: "1" }), "live"), "", "Astros in September — division gone, wild card alive");
assert.equal(clinchMark(row({ elim: "E", wcElim: "1" }), "settled"), "E", "Astros in the books — the tiebreaker settled it, the magic number never moved");
assert.equal(clinchMark(row({}), "live"), "", "nothing decided yet");

/* A season with no post-season claims nothing about anyone. */
assert.equal(clinchMark(row({ elim: "E", wcElim: "E" }), "none"), "", "1994 — no October to be eliminated from");

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
assert.deepEqual(tied.map(gamesBack(tied)), [0, 0, 3], "a tie leaves both at 0");

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
  "renders in the zone it is given"
);
assert.equal(gameStatus(preview).tone, "pre");

// A game under way or finished reports its state, not a clock.
const live = { ...preview, state: "Live", inning: 7, inningState: "Top" } as Game;
assert.equal(gameStatus(live, "Asia/Tokyo").text, "TOP 7", "zone is irrelevant once it starts");
assert.equal(
  gameStatus({ ...preview, state: "Final", inning: 10 } as Game).text,
  "SCHEDULED/10",
  "extra innings ride along with the final state"
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
assert.equal(statRank(clubs, "runs", 4), 4, "a tie consumes the place behind it");
assert.equal(statRank(clubs, "era", 1, true), 1, "lowest ERA leads");
assert.equal(statRank(clubs, "era", 4, true), 4, "highest ERA trails");
assert.equal(statRank(clubs, "runs", 5), null, "no figure, no rank");
assert.equal(
  statRank(clubs, "era", 4),
  1,
  "read the wrong way round, the worst staff would lead — the direction is the caller's"
);
assert.equal(statRank(clubs, "runs", 99), null, "a club not in the table");

/*
 * Team leader boards, which rank from every player rather than the qualified
 * few — MLB's own team-leader endpoint answers a club whose rotation spent
 * the summer hurt with one name where three were asked for.
 */
const arm = (id: number, era: string, ip: number) =>
  ({ id, name: `P${id}`, position: "P", values: { era, inningsPitched: ip } }) as PlayerStatRow;
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
      [arm(1, "4.00", 120), arm(2, "3.00", 110), arm(3, "2.00", 105), arm(4, "1.00", 3)],
      100
    )
  ),
  [
    ["P3", "2.00"],
    ["P2", "3.00"],
    ["P1", "4.00"],
  ],
  "three qualify, so the mop-up arm's 1.00 over three innings stays off the board"
);
assert.deepEqual(
  names(
    leaderBoard(
      eraSpec,
      [arm(1, "3.10", 152), arm(2, "3.06", 60), arm(3, "3.47", 55), arm(4, "0.00", 2)],
      138
    )
  ),
  [
    ["P2", "3.06"],
    ["P1", "3.10"],
    ["P3", "3.47"],
  ],
  "one qualifier alone fills the board from the half bar, not from a two-inning shutout"
);
assert.deepEqual(
  names(leaderBoard(eraSpec, [arm(1, "5.00", 4), arm(2, "9.00", 1)], 138)),
  [
    ["P1", "5.00"],
    ["P2", "9.00"],
  ],
  "a board can only be as long as the staff"
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
      138
    )
  ),
  [
    ["P2", "30"],
    ["P1", "12"],
  ],
  "a counting stat needs no bar, and an unreported figure never ranks"
);

/* Club URLs carry the name for the reader and the id for the route. */
assert.equal(teamHref(137, "San Francisco Giants"), "/team/137-san-francisco-giants");
assert.equal(
  teamHref(120, "Washington Nationals", "roster"),
  "/team/120-washington-nationals/roster"
);
assert.equal(
  teamHref(146, "Miami Marlins/Florida"),
  "/team/146-miami-marlins-florida",
  "punctuation collapses to one hyphen, and never a trailing one"
);
assert.equal(teamHref(158, ""), "/team/158", "a nameless club still has a page");
assert.equal(teamIdOf("137-san-francisco-giants"), 137);
assert.equal(teamIdOf("137"), 137, "the bare id a bookmark still carries");
assert.ok(Number.isNaN(teamIdOf("san-francisco-giants")), "a name alone names no club");
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
  "the makeup replaces the rain-out, and the season stays in date order"
);
assert.deepEqual(
  latestByGame([sched(824424, "2026-06-14T17:40:00Z", "Postponed")]).map(
    (g) => g.state
  ),
  ["Postponed"],
  "a postponement with no makeup yet is still a game on the schedule"
);

console.log("clinchMark ok");
console.log("gamesBack ok");
console.log("gameStatus ok");
console.log("latestByGame ok");
console.log("leaderBoard ok");
console.log("teamHref ok");
console.log("statRank ok");
console.log("ordinal ok");
