/*
 * Self-check for the Custom Queries board.
 *
 * What can silently go wrong: a count filter that misses the counts it means,
 * a pitcher board led by the pitcher giving up the most, or a player under
 * the floor sneaking onto it.
 *
 * Run with:  npx tsx lib/customQuery.check.ts
 */
import assert from "node:assert/strict";
import { DEFAULT_FILTERS, filtersFromQuery } from "./filters";
import { findStat, pickQuery, rankRows, savantFilters } from "./customQuery";

/* ── savantFilters ──────────────────────────────────────────────────── */

assert.deepEqual(savantFilters(DEFAULT_FILTERS), {}, "no slice, no parameters");
assert.equal(savantFilters({ ...DEFAULT_FILTERS, strikes: 2 }).hfC, "02|12|22|32|", "two strikes is every two-strike count");
assert.equal(savantFilters({ ...DEFAULT_FILTERS, balls: 3, strikes: 2 }).hfC, "32|");
assert.equal(savantFilters({ ...DEFAULT_FILTERS, pitchTypes: ["SL", "OTH"] }).hfPT, "SL|", "OTH is no code");
assert.deepEqual(
  savantFilters({ ...DEFAULT_FILTERS, dateFrom: "2026-06-01", stand: "L", pThrows: "R", twoOuts: true, lateInnings: true }),
  { game_date_gt: "2026-06-01", batter_stands: "L", pitcher_throws: "R", hfOuts: "2|", hfInn: "7|8|9|10|" },
);
/* A native form sends an untouched select as an empty value: "any", not 0. */
assert.equal(filtersFromQuery(new URLSearchParams("b=&s=")).balls, null);

/* ── rankRows ───────────────────────────────────────────────────────── */

const row = (id: number, xwoba: string, pa: string) => ({
  player_id: String(id), player_name: `P${id}, X`, xwoba, pa, pitches: "100",
});
const rows = [row(1, ".350", "80"), row(2, ".250", "90"), row(3, ".200", "10"), row(4, "", "200")];
const xwoba = findStat("xwoba");

assert.deepEqual(rankRows(rows, xwoba, "batter", 50).map((r) => r.id), [1, 2], "hitters: highest first, floor and blanks out");
assert.deepEqual(rankRows(rows, xwoba, "pitcher", 50).map((r) => r.id), [2, 1], "pitchers: lowest allowed first");
assert.deepEqual(rankRows(rows, xwoba, "batter", 0).map((r) => r.id), [1, 2, 3]);
assert.equal(rankRows(rows, xwoba, "batter", 50)[0].name, "X P1");
assert.equal(findStat("nope").key, "xwoba", "an unknown stat opens on the first");

/* ── pickQuery: the URL taken on no trust ───────────────────────────── */

assert.deepEqual(
  { ...pickQuery({ role: "x", season: "1990", min: "-3" }, 2026, 2015), stat: null },
  { role: "pitcher", season: 2026, min: 50, stat: null },
);
assert.equal(pickQuery({ min: "0" }, 2026, 2015).min, 0, "a zero floor is a real choice");

console.log("customQuery ok");
