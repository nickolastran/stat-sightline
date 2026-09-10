/*
 * Self-check for the seeding, which is the one piece of real logic here: a
 * division winner outranks every club that didn't win one, and the bracket
 * does not reseed after the wild-card round. Both are easy to get subtly
 * wrong and impossible to spot on a rendered bracket.
 *
 * Run with:  npx tsx lib/playoffs.check.ts
 */
import assert from "node:assert/strict";
import { leagueBracket, seedField, seedLeague, isSeeded, BERTHS } from "./playoffs";
import type { Division, StandingRow } from "./mlb";

const team = (id: number, name: string, wins: number, losses: number) =>
  ({ id, name, wins, losses, city: name } as unknown as StandingRow);

const division = (
  id: number,
  name: string,
  leagueId: number,
  teams: StandingRow[],
): Division => ({ id, name, leagueId, league: leagueId === 103 ? "AL" : "NL", teams });

/* One league: a weak division winner, and a strong club that finished second. */
const al = [
  division(201, "AL EAST", 103, [
    team(1, "Best", 104, 58),
    team(2, "Runner Up", 99, 63), // more wins than two division winners
  ]),
  division(202, "AL CENTRAL", 103, [
    team(3, "Weak Winner", 84, 78),
    team(4, "Also Ran", 70, 92),
  ]),
  division(200, "AL WEST", 103, [
    team(5, "Middling", 90, 72),
    team(6, "Third Wild", 88, 74),
  ]),
];

const seeds = seedLeague(al);

/* ── A division title outranks a better record ───────────────────────── */

assert.equal(seeds.length, BERTHS);
assert.deepEqual(
  seeds.map((s) => s.team.name),
  ["Best", "Middling", "Weak Winner", "Runner Up", "Third Wild", "Also Ran"],
);
// The 84-win division winner seeds ahead of the 99-win club that didn't.
assert.equal(seeds[2].team.name, "Weak Winner");
assert.equal(seeds[3].team.name, "Runner Up");
assert.ok(seeds[2].champion && !seeds[3].champion);
assert.deepEqual(seeds.map((s) => s.seed), [1, 2, 3, 4, 5, 6]);

/* ── Only the top two sit out the first round ────────────────────────── */

assert.deepEqual(seeds.map((s) => s.bye), [true, true, false, false, false, false]);
assert.equal(seeds.filter((s) => s.champion).length, 3);

/* ── The bracket pairs the way MLB does, and doesn't reseed ──────────── */

const { wc, ds, cs } = leagueBracket(seeds);
assert.equal(wc.length, 2);
assert.deepEqual(
  wc.map((s) => [
    isSeeded(s.home) ? s.home.seed.seed : 0,
    isSeeded(s.away) ? s.away.seed.seed : 0,
  ]),
  [
    [3, 6],
    [4, 5],
  ],
);
// The 1 seed draws the 4/5 winner and the 2 seed the 3/6 winner — swapping
// them is the classic bracket bug, and it survives every other check.
assert.equal(isSeeded(ds[0].home) && ds[0].home.seed.seed, 1);
assert.equal(!isSeeded(ds[0].away) && (ds[0].away as { pending: string }).pending, "4/5 WINNER");
assert.equal(isSeeded(ds[1].home) && ds[1].home.seed.seed, 2);
assert.equal(!isSeeded(ds[1].away) && (ds[1].away as { pending: string }).pending, "3/6 WINNER");
assert.ok(cs && cs.best === 7);
assert.deepEqual([wc[0].best, ds[0].best], [3, 5]);

/* ── A short field draws no bracket rather than half of one ──────────── */

const thin = leagueBracket(seeds.slice(0, 4));
assert.deepEqual([thin.wc, thin.ds, thin.cs], [[], [], null]);
assert.deepEqual(seedLeague([]), []);

/* ── Both leagues come back, American first ──────────────────────────── */

const nl = al.map((d) => division(d.id + 3, d.name.replace("AL", "NL"), 104, d.teams));
const field = seedField([...nl, ...al]);
assert.deepEqual(field.map((f) => f.leagueId), [103, 104]);
assert.equal(field[0].seeds.length, BERTHS);

console.log("playoffs.check.ts OK");
