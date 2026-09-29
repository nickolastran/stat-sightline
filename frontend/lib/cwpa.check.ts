/*
 * Self-check for cWPA: what a postseason game is worth in championships, and
 * which side of a swing a player lands on once it is scaled by that.
 *
 * What can silently go wrong is a stake read off the series score after the
 * game rather than before it — a Game 7 would read as worth nothing, the
 * series being over — and a stake that forgets the rounds still to win.
 *
 * Run with:  npx tsx lib/cwpa.check.ts
 */
import assert from "node:assert/strict";
import { cwpaTotals, gameStake, seriesOdds } from "./cwpa";

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} ≠ ${b}`);

near(seriesOdds(4, 4), 0.5, "a fresh best-of-seven is a coin flip");
near(seriesOdds(1, 1), 0.5, "one game for everything is a coin flip");
near(seriesOdds(0, 3), 1, "a series already won is won");

near(gameStake("W", 7, 3, 3), 1, "World Series Game 7 is the whole title");
near(gameStake("W", 7, 0, 0), 0.3125, "World Series Game 1");
/* A Wild Card opener: .75 against .25 to take the round, three to go after. */
near(gameStake("F", 3, 0, 0), 0.5 * 0.125, "Wild Card Game 1");
near(gameStake("R", 162, 0, 0), 0, "the regular season is worth no titles");

/* A final Game 7 the home side won: its record reads 4-3 after the game, so
   the stake has to come off 3-3 — the whole title, not nothing. */
const game7 = {
  gameType: "W",
  gamesInSeries: 7,
  status: { abstractGameState: "Final" },
  teams: {
    away: { team: { name: "Away" }, leagueRecord: { wins: 3, losses: 4 } },
    home: {
      team: { name: "Home" },
      isWinner: true,
      leagueRecord: { wins: 4, losses: 3 },
    },
  },
};
const swing = (top: boolean, pct: number, batter: number, pitcher: number) => ({
  about: { isTopInning: top },
  matchup: {
    batter: { id: batter, fullName: `B${batter}` },
    pitcher: { id: pitcher, fullName: `P${pitcher}` },
  },
  homeTeamWinProbabilityAdded: pct,
});
const { bat, arm } = cwpaTotals(
  [game7],
  [[swing(false, 40, 1, 2), swing(true, 10, 3, 4)]],
);
near(bat.get(1)!.value, 0.4, "a home walk-off swing is the batter's, at full stake");
near(arm.get(2)!.value, -0.4, "and the pitcher's loss");
near(bat.get(3)!.value, -0.1, "an away batter owns the opposite of a home gain");
assert.equal(bat.get(1)!.team, "Home");
assert.equal(bat.get(3)!.team, "Away");
assert.equal(arm.get(4)!.team, "Home", "the top-half pitcher pitches for home");

console.log("cwpa ok");
