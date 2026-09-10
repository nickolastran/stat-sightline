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
import { parseAbs, pickAbsQuery } from "./abs";

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

const page = (body: string, league = `[${row({ player_name: "League", n_challenges: 4312 })}]`) =>
  `<script>var x = [1];\n  const absData = ${body};\n  const leagueData = ${league};</script>`;

/* ── The literal comes out whole, and it's the right one ─────────────── */

const { rows: one, league } = parseAbs(page(`[${row({})}]`));
const [col] = one;
assert.equal(col.name, "Colorado Rockies");
assert.equal(col.chal, 188);
assert.equal(col.won + col.lost, 188);
assert.equal(col.netOvr, 25.8);
assert.equal(col.rsnOpp, 453);

// Two rows: the match must not stop at the first "]" it can find.
const two = parseAbs(page(`[${row({})},${row({ id: 120, player_name: "WSH" })}]`)).rows;
assert.equal(two.length, 2);
assert.equal(two[1].name, "WSH");

/* ── The league line comes off the same page, and only the league line ─ */

assert.equal(league?.chal, 4312);
assert.equal(league?.name, "LEAGUE");
// An empty board must not fall through to leagueData for its rows.
assert.deepEqual(parseAbs(page("[]")).rows, []);
// A page without the league literal still yields a board.
assert.equal(parseAbs(`const absData = [${row({})}];`).league, null);

/* ── Missing fields degrade, they don't produce NaN ──────────────────── */

const [sparse] = parseAbs(page(`[{"id":1,"player_name":"X"}]`)).rows;
assert.equal(sparse.chal, 0);
assert.equal(sparse.netRuns, 0);
assert.equal(sparse.wonPct, null); // no rate at all ≠ a rate of zero
assert.equal(sparse.teamId, null);

/* ── GROUP BY labels each row with the slice it is ───────────────────── */

const grouped = parseAbs(
  page(`[${row({ home_away: "Home", uniqueId: "115_Home" })}]`),
  ["home_away"],
).rows;
assert.equal(grouped[0].split, "Home");
assert.equal(grouped[0].key, "115_Home"); // rows must stay distinct per split
// The league line splits too, so a grouped board pins none of it.
assert.equal(
  parseAbs(page(`[${row({ home_away: "Home" })}]`), ["home_away"]).league,
  null,
);
// Ungrouped rows carry no split, and fall back to the id for their key.
assert.equal(one[0].split, null);

/* ── A page that no longer carries the table fails loudly ────────────── */

assert.throws(() => parseAbs("<html>no table here</html>"), /no absData/);

/* ── Query parameters can't be hand-edited into an unserved board ────── */

assert.equal(pickAbsQuery({ type: "catcher" }).type, "catcher");
assert.equal(pickAbsQuery({ type: "shortstop" }).type, "batting-team");
assert.equal(pickAbsQuery({}).type, "batting-team");
assert.equal(pickAbsQuery({ min: "10" }).min, "10");
assert.equal(pickAbsQuery({ min: "7" }).min, "1");
assert.equal(pickAbsQuery({}).minOpp, "0");

// Pipe-joined lists keep only what the board serves — the rest is dropped
// rather than forwarded, since Savant errors on a value it doesn't know.
assert.deepEqual(pickAbsQuery({ pitch: "FF|SL|XX" }).pitch, ["FF", "SL"]);
assert.deepEqual(pickAbsQuery({ zone: "11|15|19" }).zone, ["11", "19"]); // 15 is the zone itself
assert.deepEqual(pickAbsQuery({ org: "147|ohio|1470" }).org, ["147"]);
assert.deepEqual(pickAbsQuery({ split: "home_away|nonsense" }).group, ["home_away"]);
assert.deepEqual(pickAbsQuery({}).pitch, []);
// The player board's own ?group= must not reach the ABS grouping.
assert.deepEqual(pickAbsQuery({ split: undefined }).group, []);

console.log("abs.check.ts OK");
