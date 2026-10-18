/*
 * Self-check for pitch sequencing.
 *
 * What can silently go wrong: a pitch paired with the one before it in a
 * different plate appearance, a count keyed strikes-balls, or an off-menu
 * pitch type dropped instead of folded into OTH.
 *
 * Run with:  npx tsx lib/sequencing.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { afterPitch, byCount } from "./sequencing";

const p = (ab: number, n: number, type: string, balls: number, strikes: number) =>
  ({ game_pk: 1, at_bat_number: ab, pitch_number: n, pitch_type: type, balls, strikes }) as Pitch;

/* PA 1: FF 0-0, SL 0-1, SL 0-2. PA 2: SL 0-0, FF 1-0, KN 1-1. */
const pitches = [
  p(1, 1, "FF", 0, 0), p(1, 2, "SL", 0, 1), p(1, 3, "SL", 0, 2),
  p(2, 1, "SL", 0, 0), p(2, 2, "FF", 1, 0), p(2, 3, "KN", 1, 1),
];
const codes = ["FF", "SL", "OTH"];

const count = Object.fromEntries(byCount(pitches, codes).map((r) => [r.key, r]));
assert.equal(count["0-0"].n, 2);
assert.deepEqual(count["0-0"].shares, { FF: 0.5, SL: 0.5 });
assert.deepEqual(count["0-2"].shares, { SL: 1 }, "0-2 is no balls, two strikes");
assert.deepEqual(count["1-1"].shares, { OTH: 1 }, "a knuckleball folds into OTH");
assert.equal(count["3-2"].n, 0);

const after = Object.fromEntries(afterPitch(pitches, codes).map((r) => [r.key, r]));
/* After FF: SL (PA 1), KN→OTH (PA 2). After SL: SL (PA 1), FF (PA 2). */
assert.deepEqual(after.FF.shares, { SL: 0.5, OTH: 0.5 });
assert.deepEqual(after.SL.shares, { SL: 0.5, FF: 0.5 });
/* PA 2's first pitch must not count as following PA 1's last. */
assert.equal(after.SL.n, 2, "first pitches follow nothing");

console.log("sequencing ok");
