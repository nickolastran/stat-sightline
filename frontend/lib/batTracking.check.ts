/*
 * Self-check for bat tracking.
 *
 * What can silently go wrong: the league line averaged per hitter instead of
 * per swing (a 20-swing call-up counting as much as a regular), a hard-hit
 * slow swing dropped from the competitive set, or an outlier lost off the end
 * of a histogram.
 *
 * Run with:  npx tsx lib/batTracking.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { batLines, competitiveSwings, histogram } from "./batTracking";

const board = [
  { id: "1", swings_competitive: "900", avg_bat_speed: "70" },
  { id: "2", swings_competitive: "100", avg_bat_speed: "80" },
];
const lines = batLines(board, 2)!;
assert.equal(lines.player.batSpeed, 80);
assert.equal(lines.league.batSpeed, 71, "league bat speed is per swing: (900·70 + 100·80) / 1000");
assert.equal(batLines(board, 3), null, "a hitter off the board has no line");

/* Ten swings at 61-70 mph and one 40 mph check swing; the slowest tenth
   goes, but a 45 mph swing hit at 95 stays. */
const swing = (bat_speed: number, launch_speed: number | null = null) =>
  ({ bat_speed, launch_speed }) as Pitch;
const swings = [
  ...Array.from({ length: 10 }, (_, i) => swing(61 + i)),
  swing(40),
  swing(45, 95),
  { bat_speed: null } as Pitch, // a take
];
const kept = competitiveSwings(swings).map((p) => p.bat_speed);
assert.ok(!kept.includes(40), "the check swing is dropped");
assert.ok(kept.includes(45), "a slow swing hit at 95 mph is competitive");
assert.equal(kept.length, 11);

assert.deepEqual(histogram([1, 5, 5.9, 99, -3], 0, 2, 3), [2, 0, 3], "outliers fold into the end bins");

console.log("batTracking ok");
