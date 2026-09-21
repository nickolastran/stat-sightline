/*
 * Self-check for the draft helpers — the shaping and the fallbacks, which are
 * the only real logic here. The point of it is the thin end of the feed: a
 * 1990 pick carries a name, a club and a school with the town written into
 * it, and none of the rank / bonus / class / birthplace a modern pick has.
 *
 * Run with:  npx tsx lib/draft.check.ts
 */
import assert from "node:assert/strict";
import { dob, draftFilters, draftPicks, money, pickDraftYear } from "./draft";

const modern = {
  round: "1",
  picks: [
    {
      pickRound: "1",
      pickNumber: 1,
      roundPickNumber: 1,
      rank: 5,
      pickValue: "11075900",
      signingBonus: "8200000",
      isDrafted: true,
      isPass: false,
      scoutingReport: "https://www.mlb.com/video/eli-willits",
      home: { city: "Fort Cobb", state: "Oklahoma", country: "USA" },
      school: { name: "Fort Cobb-Broxton HS", schoolClass: "HS SR", state: "OK" },
      team: { id: 120, name: "Washington Nationals" },
      person: {
        id: 816113,
        fullName: "Eli Willits",
        birthDate: "2007-12-09",
        height: "6' 1\"",
        weight: 180,
        primaryPosition: { abbreviation: "SS" },
        batSide: { code: "S" },
        pitchHand: { code: "R" },
      },
    },
  ],
};

/* 1990: no rank, no money, no class, no state, an empty `home`. */
const old = {
  round: "1",
  picks: [
    {
      pickRound: "1",
      pickNumber: 2,
      roundPickNumber: 2,
      rank: null,
      pickValue: null,
      signingBonus: null,
      home: {},
      school: { name: "The Bolles School HS (Jacksonville, FL)" },
      team: { id: 144, name: "Atlanta Braves" },
      person: {
        id: 110029,
        fullName: "Chipper Jones",
        birthDate: "1972-04-24",
        height: "6' 4\"",
        weight: 210,
        primaryPosition: { abbreviation: "3B" },
        batSide: { code: "S" },
        pitchHand: { code: "R" },
      },
    },
    /* A club letting a pick lapse — a row with no player on it. */
    { pickRound: "1", pickNumber: 3, roundPickNumber: 3, isPass: true, team: {} },
  ],
};

const picks = draftPicks([modern, old]);
assert.equal(picks.length, 3);

const eli = picks[0];
assert.equal(eli.name, "Eli Willits");
assert.equal(eli.school, "Fort Cobb-Broxton HS (OK)");
assert.equal(eli.country, "USA");
assert.equal(eli.home, "Fort Cobb, Oklahoma");
assert.equal(eli.bonus, 8200000);
assert.equal(eli.rank, 5);

/* The thin end: strings that aren't there become "", numbers become null —
   never NaN, which would print as a number and sort as a hole. */
const chipper = picks[1];
assert.equal(chipper.school, "The Bolles School HS (Jacksonville, FL)");
assert.equal(chipper.schoolClass, "");
assert.equal(chipper.state, "");
assert.equal(chipper.country, "");
assert.equal(chipper.home, "");
assert.equal(chipper.rank, null);
assert.equal(chipper.bonus, null);
assert.equal(chipper.pickValue, null);

/* A passed pick still occupies its slot, and says so. */
assert.equal(picks[2].name, "PASS");
assert.equal(picks[2].pass, true);
assert.equal(picks[2].teamId, null);

/* Filters offer only what the board has — no empty school-state dropdown on
   a draft whose schools carry no state. */
const filters = draftFilters(picks);
assert.deepEqual(filters.states, ["OK"]);
assert.deepEqual(filters.countries, ["USA"]);
assert.deepEqual(filters.positions, ["3B", "SS"]);
assert.deepEqual(filters.teams, ["Atlanta Braves", "Washington Nationals"]);
/* Rounds keep draft order rather than sorting — "CB-A" belongs after "1". */
assert.deepEqual(draftFilters([...picks, { ...eli, round: "CB-A" }]).rounds, [
  "1",
  "CB-A",
]);

assert.equal(money(8200000), "$8.20m");
assert.equal(money(425000), "$425,000");
assert.equal(money(null), "—");

/* Sliced, not parsed: a UTC midnight would read as the 8th out west. */
assert.equal(dob("2007-12-09"), "12/09/07");
assert.equal(dob(""), "—");

assert.equal(pickDraftYear("1965", 2026), 1965);
assert.equal(pickDraftYear("1964", 2026), 2026);
assert.equal(pickDraftYear("2030", 2026), 2026);
assert.equal(pickDraftYear(undefined, 2026), 2026);

console.log("draft: ok");
