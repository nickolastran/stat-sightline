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
  type Game,
  type StandingRow,
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

console.log("clinchMark ok");
console.log("gamesBack ok");
console.log("gameStatus ok");
