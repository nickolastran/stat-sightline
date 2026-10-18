/*
 * Self-check for times through the order.
 *
 * What can silently go wrong: velocity averaged over every pitch type (so a
 * mix change reads as a fade), the fourth-and-later trips dropped instead of
 * pooled, or xwOBA read off contact alone with the strikeouts left out.
 *
 * Run with:  npx tsx lib/timesThrough.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { timesThrough } from "./timesThrough";

const p = (tto: number, pitch_type: string, release_speed: number, extra: Partial<Pitch> = {}) =>
  ({ tto, pitch_type, release_speed, description: "ball", ...extra }) as Pitch;

const { fastball, rows } = timesThrough([
  /* First time: 96 on the four-seamer, a strikeout. */
  p(1, "FF", 96), p(1, "FF", 96),
  p(1, "SL", 85, { description: "swinging_strike", events: "strikeout", woba_denom: 1, woba_value: 0 }),
  /* Second time: 95 on the four-seamer, more sliders — the all-pitch
     average would fall far more than the fastball did. */
  p(2, "FF", 95), p(2, "SL", 85), p(2, "SL", 85),
  p(2, "SL", 85, { description: "hit_into_play", events: "double", woba_denom: 1, xwoba: 1.2, woba_value: 1.25 }),
  /* Fourth and fifth times pool. */
  p(4, "FF", 94), p(5, "FF", 92),
]);

assert.equal(fastball, "FF");
const by = Object.fromEntries(rows.map((r) => [r.tto, r]));
assert.equal(by[1].velo, 96);
assert.equal(by[2].velo, 95, "velocity is the fastball's, not the mix's");
assert.equal(by[1].xwoba, 0, "a strikeout counts as zero");
assert.equal(by[2].xwoba, 1.2, "contact reads its expected value, not what happened");
assert.equal(by[1].whiffRate, 1);
assert.equal(by[4].pitches, 2, "fourth time and later pool together");
assert.equal(by[4].velo, 93);
assert.equal(by[3], undefined, "a trip he never made has no row");

console.log("timesThrough ok");
