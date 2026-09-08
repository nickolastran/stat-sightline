/*
 * Self-check for the zone grid — the two pieces that aren't a field read:
 * the batter-normalized height, and the BA denominator (walks and sacs are
 * plate appearances but not at-bats, and getting that wrong quietly deflates
 * every average in the grid).
 *
 * Run with:  npx tsx lib/metrics.check.ts
 */
import assert from "node:assert/strict";
import type { Pitch } from "./api";
import { MIN_AB, normZ, ZONE, zoneGrid } from "./metrics";

const pitch = (o: Partial<Pitch>): Pitch =>
  ({
    pitch_type: "FF", pitch_name: "Four-Seam Fastball", plate_x: 0,
    plate_z: 2.5, release_speed: null, release_spin_rate: null, pfx_x: null,
    pfx_z: null, description: null, stand: "R", sz_top: 3.5, sz_bot: 1.5,
    game_date: "2025-04-01", balls: 0, strikes: 0, outs_when_up: 0,
    inning: 1, runners_on: false, zone: 5, launch_speed: null,
    launch_angle: null, events: null, ...o,
  }) as Pitch;

/* ── normZ: a batter's own zone maps onto the rulebook rectangle ─────── */

// A tall hitter's zone (1.8–3.9) and a short one's (1.3–3.2) both stretch to
// 1.5–3.5, so "belt high" lands in the same row for both.
const tall = pitch({ sz_bot: 1.8, sz_top: 3.9, plate_z: 2.85 }); // dead center
const short = pitch({ sz_bot: 1.3, sz_top: 3.2, plate_z: 2.25 }); // dead center
assert.equal(normZ(tall)?.toFixed(3), "2.500");
assert.equal(normZ(short)?.toFixed(3), "2.500");

// Zone edges land exactly on the rectangle's edges.
assert.equal(normZ(pitch({ sz_bot: 1.8, sz_top: 3.9, plate_z: 1.8 })), ZONE.z1);
assert.equal(normZ(pitch({ sz_bot: 1.8, sz_top: 3.9, plate_z: 3.9 })), ZONE.z2);

// Out-of-zone stays out of zone after scaling.
assert.ok((normZ(pitch({ sz_bot: 1.8, sz_top: 3.9, plate_z: 4.4 })) as number) > ZONE.z2);

// Sensor gaps and nonsense zones fall back to the raw height, never NaN.
assert.equal(normZ(pitch({ sz_top: null, plate_z: 2.5 })), 2.5);
assert.equal(normZ(pitch({ sz_bot: 3.0, sz_top: 3.1, plate_z: 2.5 })), 2.5);
assert.equal(normZ(pitch({ plate_z: null })), null);

/* ── zoneGrid: 3×3 placement ─────────────────────────────────────────── */

// Up-and-in to a righty (catcher's view: left column, top row) is cell 0,0.
const g1 = zoneGrid([pitch({ plate_x: -0.6, plate_z: 3.3 })]);
assert.equal(g1.find((c) => c.n > 0)?.row, 0);
assert.equal(g1.find((c) => c.n > 0)?.col, 0);

// Low-away is the opposite corner; a ball off the plate lands in no cell.
const g2 = zoneGrid([pitch({ plate_x: 0.6, plate_z: 1.7 })]);
assert.deepEqual(
  [g2.find((c) => c.n > 0)?.row, g2.find((c) => c.n > 0)?.col],
  [2, 2]
);
assert.equal(zoneGrid([pitch({ plate_x: 1.4 })]).reduce((a, c) => a + c.n, 0), 0);

// Two batters, same normalized location, same cell — the whole point.
assert.equal(zoneGrid([tall, short]).filter((c) => c.n > 0).length, 1);

/* ── zoneGrid: batting average ───────────────────────────────────────── */

const mid = (events: string | null) => pitch({ events });
const grid = zoneGrid([
  ...Array.from({ length: 3 }, () => mid("single")),
  ...Array.from({ length: 7 }, () => mid("field_out")),
  mid("walk"), // PA, not an AB
  mid("sac_fly"), // ditto
  mid("hit_by_pitch"), // ditto
  mid(null), // a pitch that didn't end the PA
]);
const center = grid[4];
assert.equal(center.n, 14, "every pitch in the cell counts as a pitch");
assert.equal(center.ab, 10, "walks, sacs and HBP are not at-bats");
assert.equal(center.hits, 3);
assert.equal(center.ba, 0.3);

// One at-bat short of the minimum reads "—" rather than a 1.000 mirage.
const thin = zoneGrid(Array.from({ length: MIN_AB - 1 }, () => mid("single")));
assert.equal(thin[4].ba, null);
assert.equal(thin[4].hits, MIN_AB - 1);
assert.equal(zoneGrid([mid("single"), ...Array.from({ length: MIN_AB - 1 }, () => mid("field_out"))])[4].ba, 0.1);

// An empty slice is nine empty cells, not a crash.
assert.equal(zoneGrid([]).length, 9);
assert.equal(zoneGrid([]).every((c) => c.n === 0 && c.ba === null), true);

console.log("metrics.check.ts OK");
