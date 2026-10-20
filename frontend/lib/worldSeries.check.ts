/*
 * Self-check for the World Series forecast.
 *
 * What can silently go wrong: a series that doesn't stop at four wins, a
 * final game that isn't held fixed, a starter thrown on two days' rest, or a
 * swing with the wrong sign.
 *
 * Run with:  npx tsx lib/worldSeries.check.ts
 */
import assert from "node:assert/strict";
import { seriesOdds } from "./cwpa";
import {
  baseOdds,
  centered,
  gameOdds,
  projectRotation,
  pythag,
  REGRESS_GAMES,
  seriesForecast,
  strengthOf,
} from "./worldSeries";

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

/* Even games: a coin flip, and the same series odds cwpa's recursion gives. */
const even = seriesForecast(Array(7).fill(0.5));
near(even.odds, 0.5, "even series");
near(seriesForecast(Array(7).fill(0.6)).odds, seriesOdds(4, 4, 0.6), ".6 a game over seven");
/* Every way it ends adds to one; a sweep is .5^4 each way. */
near(even.aIn.reduce((n, q) => n + q, 0) + even.bIn.reduce((n, q) => n + q, 0), 1, "lengths sum");
near(even.aIn[4], 1 / 16, "sweep");
assert.equal(even.aIn[3], 0, "nobody wins in three");

/* Three games already won: one more of four left at .5 each. */
near(seriesForecast([1, 1, 1, 0.5, 0.5, 0.5, 0.5]).odds, 1 - 0.5 ** 4, "up 3-0");

/* Strength: equal clubs leave only home field; the better club is favored. */
near(pythag(700, 700), 0.5, "even runs");
/* A .600 run record over a season reads about 30% of the way back to .500. */
const p6 = pythag(800, 680);
near(strengthOf(800, 680, 162), (p6 * 162 + 0.5 * REGRESS_GAMES) / (162 + REGRESS_GAMES), "regressed");
assert.ok(strengthOf(800, 680, 162) < p6 && strengthOf(800, 680, 162) > 0.5);
assert.ok(Math.abs(baseOdds(0.5, 0.5) - 0.535) < 1e-9, "home field alone");
assert.ok(baseOdds(0.6, 0.5) > 0.6, "better club at home");
assert.ok(gameOdds(0.5, 0.02, 0) > 0.5, "home lineup that hits the starter gains");
assert.ok(gameOdds(0.5, 0, 0.02) < 0.5, "away lineup that hits the starter costs");

/* Against its own rotation: the ace's start reads below, the No. 4's above. */
assert.deepEqual(centered([-0.04, 0, 0.04, null]), [-0.04, 0, 0.04, 0]);
assert.deepEqual(centered([null, null]), [0, 0]);

/* Rotation: the ace (two starts, first in October) on full rest takes Game 1,
   the man who pitched yesterday doesn't. */
const starts = [
  { id: 1, name: "Ace", date: "2026-10-01" },
  { id: 2, name: "Two", date: "2026-10-02" },
  { id: 3, name: "Three", date: "2026-10-04" },
  { id: 4, name: "Four", date: "2026-10-05" },
  { id: 1, name: "Ace", date: "2026-10-06" },
  { id: 2, name: "Two", date: "2026-10-10" },
];
const rot = projectRotation(starts, ["2026-10-11", "2026-10-12", "2026-10-15"]);
assert.equal(rot[0]?.name, "Ace", "game 1 to the rested ace");
assert.notEqual(rot[1]?.name, "Two", "nobody on one day's rest");
assert.notEqual(rot[2]?.name, "Ace", "the ace doesn't go again on four days");
/* An announced probable takes the game. */
const named = projectRotation(starts, ["2026-10-11"], [{ id: 9, name: "Named" }]);
assert.deepEqual(named[0], { id: 9, name: "Named", announced: true });
assert.deepEqual(projectRotation([], ["2026-10-11"]), [null], "no starts, no projection");

console.log("worldSeries ok");
