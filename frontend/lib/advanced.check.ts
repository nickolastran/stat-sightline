/*
 * Self-check for the advanced boards' own logic — the parts that aren't a
 * fetch. The CSV reader is the whole risk here: Savant leads every people
 * board with `"Last, First"`, so a parser that splits on commas shifts every
 * figure one column left and the board silently reports another player's
 * season. That fails loudly below instead.
 *
 * Run with:  npx tsx lib/advanced.check.ts
 */
import assert from "node:assert/strict";
import {
  ADV_BATTING_COLS,
  ADV_CLUB_BATTING_COLS,
  ADV_FIRST_SEASON,
  ADV_PITCHING_COLS,
  advCols,
  catalogFor,
  colGroups,
  CUSTOM_DIVISIONS,
  CUSTOM_MINS,
  findAdvView,
  flipName,
  hasAllYears,
  parseCsv,
  pickAdvSeason,
  pickCustomQuery,
} from "./advanced";

/* ── A quoted name doesn't shift the row ─────────────────────────────── */

const savant = `﻿"last_name, first_name","player_id","avg_hit_speed"\r\n"Judge, Aaron","592450","95.3"\r\n"Ohtani, Shohei","660271","94.1"\r\n`;
const rows = parseCsv(savant);
assert.equal(rows.length, 2);
assert.equal(rows[0]["last_name, first_name"], "Judge, Aaron");
assert.equal(rows[0].player_id, "592450");
assert.equal(rows[0].avg_hit_speed, "95.3");
assert.equal(rows[1].player_id, "660271");
// The BOM is Savant's, not part of the first column's name.
assert.ok(!Object.keys(rows[0])[0].startsWith("﻿"));

// Bare fields, escaped quotes, a last line with no newline, empty cells.
assert.deepEqual(parseCsv('a,b,c\n1,,3'), [{ a: "1", b: "", c: "3" }]);
assert.deepEqual(parseCsv('a\n"say ""hi"""'), [{ a: 'say "hi"' }]);
assert.deepEqual(parseCsv("a,b\n1,2\n"), [{ a: "1", b: "2" }]);
// A field short of the header reads blank rather than undefined.
assert.deepEqual(parseCsv("a,b\n1"), [{ a: "1", b: "" }]);
// A header alone is an empty board, not a row of nothing.
assert.deepEqual(parseCsv("a,b\n"), []);
assert.deepEqual(parseCsv(""), []);
// A newline inside quotes belongs to the field.
assert.deepEqual(parseCsv('a\n"one\ntwo"'), [{ a: "one\ntwo" }]);

/* ── Savant's name order is flipped back ─────────────────────────────── */

assert.equal(flipName("Judge, Aaron"), "Aaron Judge");
assert.equal(flipName("Blue Jays"), "Blue Jays");
assert.equal(flipName(""), "");

/* ── Every column is addressable, and formats to something sortable ──── */

for (const cols of [ADV_BATTING_COLS, ADV_PITCHING_COLS]) {
  const keys = cols.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate column key");
  for (const c of cols) {
    assert.ok(c.label && c.title, `${c.key} needs a label and a title`);
    // A missing figure is blank, never a zero that would rank as the worst
    // season in the league.
    assert.equal(c.fmt(undefined), null);
    assert.equal(c.fmt(""), null);
    // What it does print has to parse back, or the table can't sort on it.
    assert.notEqual(c.fmt(0.5), null);
    assert.ok(
      Number.isFinite(Number(String(c.fmt(0.5)).replace("+", ""))),
      `${c.key} prints something unsortable`,
    );
  }
}

// The percentage columns print the percentage, not the fraction.
const bb = ADV_BATTING_COLS.find((c) => c.label === "BB%")!;
assert.equal(bb.fmt(".084"), "8.4");
// The rate columns drop the leading zero, the way a batting line reads.
const woba = ADV_BATTING_COLS.find((c) => c.label === "wOBA")!;
assert.equal(woba.fmt(0.4628), ".463");
// A run total keeps its sign — "-4.2" is the point of the column.
const wraa = ADV_BATTING_COLS.find((c) => c.label === "wRAA")!;
assert.equal(wraa.fmt(82.53), "+82.5");
assert.equal(wraa.fmt(-4.16), "-4.2");

/* ── A club board drops what a club can't have ───────────────────────── */

assert.ok(ADV_CLUB_BATTING_COLS.some((c) => c.raw === "war"));
// A summed wRC+ of 3,400 is not a club's season.
assert.ok(!ADV_CLUB_BATTING_COLS.some((c) => c.raw === "wRcPlus"));
assert.ok(advCols("league-pitching").every((c) => c.raw !== "pli"));

/* ── The header bands span their own columns and nothing else ────────── */

const bands = colGroups(ADV_BATTING_COLS);
assert.equal(
  bands.reduce((n, b) => n + b.span, 0),
  ADV_BATTING_COLS.length,
);
assert.equal(new Set(bands.map((b) => b.label)).size, bands.length);

/* ── Query parameters can't reach a season with no tracking in it ────── */

assert.equal(pickAdvSeason("2019", 2026), 2019);
assert.equal(pickAdvSeason("2014", 2026), 2026, "before Statcast");
assert.equal(pickAdvSeason("2030", 2026), 2026, "the future");
assert.equal(pickAdvSeason(undefined, 2026), 2026);
assert.equal(pickAdvSeason("all", 2026), 2026);
assert.equal(pickAdvSeason(String(ADV_FIRST_SEASON), 2026), ADV_FIRST_SEASON);

assert.ok(findAdvView("player-batting"));
assert.equal(findAdvView("player-fielding"), undefined);
assert.ok(hasAllYears("player-batting"));
assert.ok(!hasAllYears("league-batting"));

console.log("advanced.check.ts OK");

/* ── The custom board can't be steered anywhere it doesn't serve ─────── */

const clubs = new Set(["147", "141"]);

// Nothing set at all is a readable default line, not an empty board.
const plain = pickCustomQuery({}, clubs);
assert.equal(plain.group, "hitting");
assert.ok(plain.cols.length >= 8);
assert.equal(plain.league, "all");
assert.equal(plain.division, "all");
assert.equal(plain.team, "all");
assert.equal(plain.min, "q");

// A hand-edited column list keeps only columns this group actually has.
const picked = pickCustomQuery(
  { group: "pitching", cols: "season.era|saber.fip|season.homeRuns|bat.avg_bat_speed|nonsense" },
  clubs,
);
assert.deepEqual(picked.cols, ["season.era", "saber.fip", "season.homeRuns"]);
// No `?cols=` at all is a first visit and opens on the default line; a
// `?cols=` that is present and empty is a reader who cleared every box, and
// that board stays blank rather than quietly refilling itself.
assert.ok(pickCustomQuery({}, clubs).cols.length >= 8);
assert.deepEqual(pickCustomQuery({ cols: "" }, clubs).cols, []);
assert.deepEqual(pickCustomQuery({ cols: "nonsense" }, clubs).cols, []);
assert.equal(pickCustomQuery({ cols: "" }, clubs).sort, undefined);
// A batting column can't be smuggled onto a pitching board.
assert.ok(!picked.cols.includes("bat.avg_bat_speed"));

// Filters that name nothing real fall back to unfiltered.
assert.equal(pickCustomQuery({ team: "999" }, clubs).team, "all");
assert.equal(pickCustomQuery({ team: "147" }, clubs).team, "147");
assert.equal(pickCustomQuery({ div: "AL EAST" }, clubs).division, "AL EAST");
assert.equal(pickCustomQuery({ div: "AL MIDDLE" }, clubs).division, "all");
assert.equal(pickCustomQuery({ league: "105" }, clubs).league, "all");
assert.equal(pickCustomQuery({ min: "1000" }, clubs).min, "q");
assert.equal(pickCustomQuery({ pos: "SS" }, clubs).position, "SS");
assert.equal(pickCustomQuery({ pos: "QB" }, clubs).position, "all");
assert.equal(
  pickCustomQuery({ cols: "season.hits|season.avg", sort: "season.hits" }, clubs).sort,
  "season.hits",
);
// A sort naming a column the board isn't showing falls back to the headline
// figure, not to whichever column happens to sit leftmost.
assert.equal(pickCustomQuery({ sort: "nope" }, clubs).sort, "saber.war");
assert.equal(pickCustomQuery({ sort: "season.hits" }, clubs).sort, "saber.war");
assert.equal(
  pickCustomQuery({ cols: "season.avg|season.hits" }, clubs).sort,
  "season.avg",
);
assert.equal(
  pickCustomQuery({ group: "fielding" }, clubs).sort,
  "oaa.outs_above_average",
);

// Every division the picker offers is a name the club list actually uses.
for (const d of CUSTOM_DIVISIONS)
  assert.ok(d.value === "all" || /^(AL|NL) (EAST|CENTRAL|WEST)$/.test(d.value));

// Every default names a column of its own group, or the board opens blank.
for (const g of ["hitting", "pitching", "fielding"] as const) {
  const keys = new Set(catalogFor(g).map((c) => c.key));
  for (const k of pickCustomQuery({ group: g }, clubs).cols)
    assert.ok(keys.has(k), `${g} default ${k} is not a column`);
  // Standard and tracked columns can't collide on a key.
  const all = catalogFor(g).map((c) => c.key);
  assert.equal(new Set(all).size, all.length, `${g} has a duplicate key`);
  assert.ok(all.length > 14, `${g} catalogue is too thin`);
}

// The floors are numbers the board can compare against, bar the two words.
for (const m of CUSTOM_MINS)
  assert.ok(m.value === "q" || Number.isInteger(Number(m.value)));

console.log("advanced.check.ts custom OK");
