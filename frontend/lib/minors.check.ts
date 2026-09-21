/*
 * Self-check for the minor-league helpers — the grouping and the fallbacks,
 * which are the only real logic here. Both are about what the payload leaves
 * out: a league that plays without divisions names none on its clubs, and the
 * division and league names live on the hydrated club rather than on the
 * record they group.
 *
 * Run with:  npx tsx lib/minors.check.ts
 */
import assert from "node:assert/strict";
import { minorDivisions, pickLevel, pickMinorStat } from "./minors";

const record = (
  leagueId: number,
  league: string,
  division: string | null,
  /** id, full name, nickname, parent club. */
  clubs: [number, string, string, string][],
) => ({
  league: { id: leagueId },
  division: division ? { id: leagueId * 10 } : undefined,
  teamRecords: clubs.map(([id, name, clubName, org]) => ({
    wins: 80,
    losses: 60,
    team: {
      id,
      name,
      clubName,
      league: { id: leagueId, name: league },
      division: division ? { id: leagueId * 10, name: division } : undefined,
      parentOrgName: org,
    },
  })),
});

const divisions = minorDivisions([
  record(118, "Midwest League", "Midwest League West", [
    [582, "South Bend Cubs", "Cubs", "Chicago Cubs"],
  ]),
  record(126, "Northwest League", null, [
    [529, "Eugene Emeralds", "Emeralds", "San Francisco Giants"],
  ]),
  record(116, "South Atlantic League", "South Atlantic League North", [
    [598, "Frederick Keys", "Keys", "Baltimore Orioles"],
  ]),
  /* An empty group is a league that hasn't started — it shows nothing. */
  record(999, "Phantom League", "Phantom Division", []),
]);

/* Sorted by league, then division; the empty group dropped. */
assert.deepEqual(
  divisions.map((d) => d.name),
  [
    "MIDWEST LEAGUE WEST",
    "NORTHWEST LEAGUE",
    "SOUTH ATLANTIC LEAGUE NORTH",
  ],
);

/* A league without divisions falls back to its own name rather than "DIV
   1260" — on the group and on the row inside it. */
const nw = divisions[1];
assert.equal(nw.league, "NORTHWEST LEAGUE");
assert.equal(nw.teams[0].division, "Northwest League");

/* The parent club rides along, and the town is the name less the nickname. */
const cubs = divisions[0].teams[0];
assert.equal(cubs.org, "Chicago Cubs");
assert.equal(cubs.city, "South Bend");

/* Levels and sort columns: anything unrecognised lands somewhere real. */
assert.equal(pickLevel("aa").sportId, 12);
assert.equal(pickLevel("mlb").value, "aaa");
assert.equal(pickLevel(undefined).value, "aaa");
assert.equal(pickMinorStat("homeRuns", "hitting"), "homeRuns");
assert.equal(pickMinorStat("era", "hitting"), "homeRuns");
assert.equal(pickMinorStat(undefined, "pitching"), "era");
assert.equal(pickMinorStat("war", "pitching"), "era");

console.log("minors: ok");
