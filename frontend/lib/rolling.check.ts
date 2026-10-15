/*
 * Self-check for rolling form — the PA count (running plays aren't PAs), the
 * xwOBA mix of estimate and actual value, and that a window is a sum over its
 * games rather than an average of game rates.
 *
 * Run with:  npx tsx lib/rolling.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { gameLines, rolling, seasonRate } from "./rolling";

const pa = (game: number, events: string, o: Partial<Pitch> = {}): Pitch =>
  ({
    game_pk: game,
    game_date: `2025-04-${String(game).padStart(2, "0")}`,
    events,
    woba_denom: 1,
    ...o,
  }) as Pitch;

const games = gameLines([
  // Game 1: a K, a walk, a hard out with a big estimate, and a caught stealing.
  pa(1, "strikeout", { woba_value: 0 }),
  pa(1, "walk", { woba_value: 0.7 }),
  pa(1, "field_out", { woba_value: 0, xwoba: 0.8 }),
  pa(1, "caught_stealing_2b", { woba_denom: null }),
  { game_pk: 1, game_date: "2025-04-01", events: null } as Pitch, // a mid-PA pitch
  // Game 2: one PA, a strikeout.
  pa(2, "strikeout", { woba_value: 0 }),
  // Game 3, listed first: order comes from the date, not the feed.
  pa(3, "single", { woba_value: 0.9 }),
].reverse());

assert.deepEqual(games.map((g) => g.pa), [3, 1, 1], "the caught stealing is not a PA");
assert.equal(games[0].k, 1);
assert.ok(Math.abs(games[0].xNum - 1.5) < 1e-9, "estimate on contact, actual on the walk");

const k2 = rolling(games, 2, "k");
assert.deepEqual(k2.map((p) => p.unit), [2, 3], "points start once a window is full");
assert.equal(k2[0].value, 2 / 4, "games 1-2: 2 K in 4 PA, not the mean of 1/3 and 1/1");
assert.equal(k2[1].value, 1 / 2, "game 1 has rolled out of the window");

assert.equal(seasonRate(games, "k"), 2 / 5);
assert.equal(rolling(games, 50, "k").length, 0, "fewer games than the window: no line");

/* A pitcher's unit is the batter faced, in at-bat order within a game. */
const bf = gameLines(
  [
    pa(1, "single", { at_bat_number: 7, woba_value: 0.9 }),
    pa(1, "strikeout", { at_bat_number: 2, woba_value: 0 }),
    pa(1, "caught_stealing_2b", { at_bat_number: 5, woba_denom: null }),
    pa(2, "walk", { at_bat_number: 1, woba_value: 0.7 }),
  ],
  "pitcher",
);
assert.deepEqual(bf.map((u) => u.pa), [1, 1, 1], "one unit per batter faced");
assert.deepEqual(bf.map((u) => u.k), [1, 0, 0], "at-bat 2 comes before at-bat 7");
assert.deepEqual(
  rolling(bf, 2, "k").map((p) => p.value),
  [1 / 2, 0],
  "a window can end mid-game",
);

console.log("rolling: ok");
