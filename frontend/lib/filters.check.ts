/*
 * Self-check for the dashboard filters in the URL.
 *
 * What can silently go wrong: a slice that doesn't come back the same from
 * its own link, a default written into every URL, or a pasted value the
 * filters can't hold (a 7-ball count, a script in a date) getting through.
 *
 * Run with:  npx tsx lib/filters.check.ts
 */
import assert from "node:assert/strict";
import {
  baselineOf,
  comparing,
  DEFAULT_FILTERS,
  filtersFromQuery,
  filtersToQuery,
  midpoint,
  splitAt,
  type FilterState,
} from "./filters";

/* The default slice is a bare URL, and a bare URL is the default slice. */
assert.equal(filtersToQuery(DEFAULT_FILTERS).toString(), "");
assert.deepEqual(filtersFromQuery(new URLSearchParams()), DEFAULT_FILTERS);

/* Every filter set at once comes back exactly. */
const full: FilterState = {
  dateFrom: "2026-04-01",
  dateTo: "2026-06-30",
  pitchTypes: ["SL", "ST", "OTH"],
  balls: 3,
  strikes: 2,
  stand: "L",
  pThrows: "R",
  risp: true,
  twoOuts: true,
  lateInnings: true,
  vsFrom: "2026-03-26",
  vsTo: "2026-03-31",
};
assert.deepEqual(filtersFromQuery(filtersToQuery(full)), full);

/* Every type unchecked is a real slice, not "all". */
const none = { ...DEFAULT_FILTERS, pitchTypes: [] };
assert.deepEqual(filtersFromQuery(filtersToQuery(none)), none);

/* Pasted junk falls back to the default, field by field. */
const junk = filtersFromQuery(
  new URLSearchParams("from=<script>&b=7&s=-1&bat=X&arm=l&pt=FF,../x,ZZZZ&risp=yes"),
);
assert.deepEqual(junk, { ...DEFAULT_FILTERS, pitchTypes: ["FF"] });

/* ── Comparing two ranges ────────────────────────────────────────────── */

assert.equal(comparing(DEFAULT_FILTERS), false);
/* Before/after a date: no day in both slices, none dropped between them. */
const split = { ...DEFAULT_FILTERS, pitchTypes: ["FC"], ...splitAt("2026-03-01") };
assert.deepEqual(
  [split.vsTo, split.dateFrom],
  ["2026-02-28", "2026-03-01"],
  "a leap-less February ends on the 28th",
);
assert.ok(comparing(split));
/* A keeps every other filter; only its dates are its own. */
const a = baselineOf(split);
assert.deepEqual([a.dateFrom, a.dateTo, a.pitchTypes], [null, "2026-02-28", ["FC"]]);
assert.equal(midpoint("2026-03-26", "2026-09-27"), "2026-06-27", "185 days, split after 93");
assert.equal(midpoint("2026-04-01", "2026-04-01"), "2026-04-01");

console.log("filters ok");
