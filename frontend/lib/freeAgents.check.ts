/*
 * Self-check for the free-agent row: available vs signed, MLB vs minor-league.
 *
 * Run with:  npx tsx lib/freeAgents.check.ts
 */
import assert from "node:assert/strict";
import { toFreeAgent } from "./freeAgents";

const abbr = (id: number | null) =>
  id === 135 ? "SD" : id === 110 ? "BAL" : "";

const open = toFreeAgent(
  {
    player: { id: 592094, fullName: "Jason Adam" },
    originalTeam: { id: 135 },
    newTeam: { link: "/api/v1/teams/null" },
    dateDeclared: "2026-10-29",
    position: { abbreviation: "P" },
  },
  { currentAge: 35, batSide: { code: "R" }, pitchHand: { code: "R" } },
  abbr,
  null,
);
assert.equal(open.toId, null);
assert.equal(open.fromAbbr, "SD");
assert.equal(open.type, "MLB");
assert.equal(open.hand, "R/R");

const signed = toFreeAgent(
  {
    player: { id: 1 },
    originalTeam: { id: 135 },
    newTeam: { id: 110 },
    notes: "Minor League Free Agent",
  },
  undefined,
  abbr,
  5_000_000,
);
assert.equal(signed.toAbbr, "BAL");
assert.equal(signed.type, "MiLB");
assert.equal(signed.age, null);
assert.equal(signed.salary, 5_000_000);
assert.equal(signed.note, "");

const claimed = toFreeAgent(
  { player: { id: 2 }, notes: "Claimed off waivers." },
  undefined,
  abbr,
  null,
);
assert.equal(claimed.note, "Claimed Off Waivers");
assert.equal(claimed.war, null);
assert.equal(claimed.line, "");

/* Traded mid-season: the split without a team is the season total. */
const traded = toFreeAgent(
  { player: { id: 3 } },
  {
    primaryPosition: { type: "Pitcher" },
    stats: [
      {
        type: { displayName: "season" },
        group: { displayName: "pitching" },
        splits: [
          { stat: { era: "7.11", inningsPitched: "19.0" } },
          { team: { id: 109 }, stat: { era: "6.28", inningsPitched: "14.1" } },
        ],
      },
      {
        type: { displayName: "sabermetrics" },
        group: { displayName: "pitching" },
        splits: [{ stat: { war: -0.653463 } }, { team: { id: 109 }, stat: { war: -0.15 } }],
      },
    ],
  },
  abbr,
  null,
);
assert.equal(traded.war, -0.7);
assert.equal(traded.line, "7.11 ERA · 19.0 IP");

console.log("freeAgents: ok");
