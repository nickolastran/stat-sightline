/*
 * Self-check for the ABS board's one piece of real logic: pulling Savant's
 * table out of the page it is embedded in. The literal sits in 1.6 MB of
 * markup next to a second one (`leagueData`), so the risk is a regex that
 * runs past the end of the array or grabs the wrong one — both of which fail
 * loudly here and silently in production.
 *
 * Run with:  npx tsx lib/abs.check.ts
 */
import assert from "node:assert/strict";
import { parseAbs, pickAbsMin, pickAbsType } from "./abs";

const row = (o: Record<string, unknown>) =>
  JSON.stringify({
    id: 115,
    player_name: "Colorado Rockies",
    player_team: 115,
    team_abbr: "COL",
    n_challenges: 188,
    n_overturns: 119,
    n_fails: 69,
    rate_overturns: 0.633,
    net_net_chal: 25.8,
    net_net_runs: 5.49,
    n_strikeouts: 38,
    n_walks: 11,
    rate_challenges: 0.0262,
    exp_rate_challenges: 0.022,
    exp_rate_challenges_diff: 0.0042,
    n_chal_reasonable_opps: 453,
    n_chal_reasonable: 144,
    rate_chal_reasonable: 0.77,
    rate_reasonable_opp_taken: 0.32,
    ...o,
  });

const page = (body: string) =>
  `<script>var x = [1];\n  const absData = ${body};\n  const leagueData = [{"player_name":"League"}];</script>`;

/* ── The literal comes out whole, and it's the right one ─────────────── */

const [col] = parseAbs(page(`[${row({})}]`));
assert.equal(col.name, "Colorado Rockies");
assert.equal(col.chal, 188);
assert.equal(col.won + col.lost, 188);
assert.equal(col.netOvr, 25.8);
assert.equal(col.rsnOpp, 453);

// Two rows: the match must not stop at the first "]" it can find.
const two = parseAbs(page(`[${row({})},${row({ id: 120, player_name: "WSH" })}]`));
assert.equal(two.length, 2);
assert.equal(two[1].name, "WSH");

// And it must not pick up leagueData when absData is empty.
assert.deepEqual(parseAbs(page("[]")), []);

/* ── Missing fields degrade, they don't produce NaN ──────────────────── */

const [sparse] = parseAbs(page(`[{"id":1,"player_name":"X"}]`));
assert.equal(sparse.chal, 0);
assert.equal(sparse.netRuns, 0);
assert.equal(sparse.wonPct, null); // no rate at all ≠ a rate of zero
assert.equal(sparse.teamId, null);

/* ── A page that no longer carries the table fails loudly ────────────── */

assert.throws(() => parseAbs("<html>no table here</html>"), /no absData/);

/* ── Query parameters can't be hand-edited into an unserved board ────── */

assert.equal(pickAbsType("catcher"), "catcher");
assert.equal(pickAbsType("shortstop"), "batting-team");
assert.equal(pickAbsType(undefined), "batting-team");
assert.equal(pickAbsMin("10"), "10");
assert.equal(pickAbsMin("7"), "1");

console.log("abs.check.ts OK");
