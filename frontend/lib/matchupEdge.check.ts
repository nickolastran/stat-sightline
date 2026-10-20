/*
 * Self-check for the pitch-mix matchup edge.
 *
 * What can silently go wrong: a hitter's tiny sample against a pitch swamping
 * the projection, a pitch weighted by the wrong side's usage, or the best and
 * worst pitches swapped.
 *
 * Run with:  npx tsx lib/matchupEdge.check.ts
 */
import assert from "node:assert/strict";
import { edgeLines, pitchEdges, REGRESS_PA, type ArsenalBoards } from "./matchupEdge";

const row = (id: number, type: string, usage: number, pa: number, xwoba: number | null) => ({
  id, type, usage, pa, xwoba,
});

/* A league of two pitch types, both hit at .300, and one pitcher who throws
   fastballs 75% of the time and is league-average with both. */
const boards: ArsenalBoards = {
  bat: [
    row(1, "FF", 0, 1000, 0.3),
    row(1, "SL", 0, 1000, 0.3),
    /* Hitter 2 crushes fastballs over a big sample, flails at sliders. */
    row(2, "FF", 0, REGRESS_PA * 3, 0.4),
    row(2, "SL", 0, REGRESS_PA * 3, 0.2),
    /* Hitter 5, his mirror, keeps the league at .300 on both pitches. */
    row(5, "FF", 0, REGRESS_PA * 3, 0.2),
    row(5, "SL", 0, REGRESS_PA * 3, 0.4),
    /* Hitter 3: one lucky slider PA. */
    row(3, "SL", 0, 1, 1.0),
  ],
  arm: [row(9, "FF", 75, 500, 0.3), row(9, "SL", 25, 500, 0.3)],
};

const lines = edgeLines(boards, 9, [1, 2, 3, 4])!;
const num = (s: unknown) => Number(String(s).replace(/^([+-]?)\./, "$10."));

/* League hitter (1) stays at .300. */
assert.ok(Math.abs(num(lines[1]!.proj) - 0.3) < 0.002, `league hitter ${lines[1]!.proj}`);

/* Hitter 2: each pitch shrinks 3:1 toward .300, so FF .375 and SL .225,
   weighted 75/25 by the pitcher's mix — .3375, nearly .338. */
assert.ok(Math.abs(num(lines[2]!.proj) - 0.3375) < 0.002, `fastball hitter ${lines[2]!.proj}`);
assert.match(String(lines[2]!.best), /^FF /, "his best pitch is the fastball");
assert.match(String(lines[2]!.worst), /^SL /, "his worst is the slider");
assert.equal(lines[2]!.pa, REGRESS_PA * 6);

/* Hitter 3's one PA barely moves him: (1.0 + .3 * 50) / 51 on a quarter of
   the mix. */
assert.ok(num(lines[3]!.proj) < 0.31, `one-PA hitter ${lines[3]!.proj}`);

/* A hitter the board has never seen reads as the league. */
assert.ok(Math.abs(num(lines[4]!.proj) - 0.3) < 0.002, "an unseen hitter is league average");
assert.equal(lines[4]!.pa, 0);

assert.equal(edgeLines(boards, 404, [1]), null, "a pitcher off the board has no mix");

/* The breakdown behind hitter 2's line: fastball first, as thrown, at .375. */
const parts = pitchEdges(boards, 9, 2)!;
assert.deepEqual(parts.pitches.map((p) => p.type), ["FF", "SL"]);
assert.ok(Math.abs(parts.pitches[0].proj - 0.375) < 1e-9, `FF ${parts.pitches[0].proj}`);
assert.equal(parts.pitches[0].usage, 75);
assert.equal(pitchEdges(boards, 404, 2), null);

console.log("matchupEdge ok");
