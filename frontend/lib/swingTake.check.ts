/*
 * Self-check for swing/take run value.
 *
 * What can silently go wrong: a ring boundary drawn off the plate instead of
 * the hitter's zone, a take credited as a swing, or an untracked pitch
 * landing in the heart because its coordinates read as zero.
 *
 * Run with:  npx tsx lib/swingTake.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { attackZone, swingTake } from "./swingTake";

/* A zone from 1.5 to 3.5 ft: centre 2.5, half-height 1 ft plus a ball. */
const p = (x: number | null, z: number, description: string, run_value: number) =>
  ({ plate_x: x, plate_z: z, sz_top: 3.5, sz_bot: 1.5, description, run_value }) as Pitch;

assert.equal(attackZone(p(0, 2.5, "ball", 0)), "heart", "down the middle");
assert.equal(attackZone(p(0.7, 2.5, "ball", 0)), "shadow", "8.4 in. off centre is past 67% of 10");
assert.equal(attackZone(p(1.3, 2.5, "ball", 0)), "chase", "15.6 in. is past 133%");
assert.equal(attackZone(p(0, 4.9, "ball", 0)), "waste", "2.4 ft above centre is past 200% of 1.12");
assert.equal(attackZone(p(null, 2.5, "ball", 0)), null, "untracked pitches have no ring");

const rows = Object.fromEntries(
  swingTake([
    p(0, 2.5, "hit_into_play", 0.8), // heart swing, a hit
    p(0, 2.5, "called_strike", -0.05), // heart take, a strike given away
    p(1.3, 2.5, "swinging_strike", -0.1), // chase swing
    p(1.3, 2.5, "ball", 0.06), // chase take
    p(null, 2.5, "ball", 1), // untracked — ignored
  ]).map((r) => [r.zone, r]),
);
assert.equal(rows.heart.swings, 1);
assert.ok(Math.abs(rows.heart.swingRuns - 0.8) < 1e-9);
assert.ok(Math.abs(rows.heart.takeRuns + 0.05) < 1e-9, "taking a heart strike costs runs");
assert.ok(Math.abs(rows.chase.runs + 0.04) < 1e-9);
assert.equal(rows.all.pitches, 4, "the untracked pitch sits out");
assert.equal(rows.shadow.pitches, 0);

console.log("swingTake ok");
