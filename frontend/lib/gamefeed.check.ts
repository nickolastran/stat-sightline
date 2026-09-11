/*
 * Self-check for the game feed's one piece of real logic: folding a day of
 * play logs into the four tracked boards, and the two day-score formulas the
 * hitter and pitcher tables are ordered by.
 *
 * What can silently go wrong here is a board that ranks one player's five
 * best marks instead of five players, a whiff count that misses the blocked
 * and tipped calls, and a score formula with a sign the wrong way round —
 * all of which read as plausible numbers on the page.
 *
 * Run with:  npx tsx lib/gamefeed.check.ts
 */
import assert from "node:assert/strict";
import { feedBoards, gameScore, hitterPoints } from "./gamefeed";

const pitch = (o: Record<string, unknown>) => ({ isPitch: true, ...o });

const log = (plays: unknown[]) => ({ allPlays: plays });

const play = (
  batter: number,
  pitcher: number,
  event: string,
  events: unknown[],
) => ({
  result: { event },
  matchup: {
    batter: { id: batter, fullName: `B${batter}` },
    pitcher: { id: pitcher, fullName: `P${pitcher}` },
  },
  playEvents: events,
});

const board = (boards: ReturnType<typeof feedBoards>, code: string) =>
  boards.find((b) => b.code === code)!;

/* ── A board ranks players, not one player's best five ──────────────── */
{
  const hot = [101, 99, 97, 95, 93].map((v) =>
    pitch({ hitData: { launchSpeed: v, totalDistance: 300 } }),
  );
  const boards = feedBoards([
    log([
      play(1, 9, "Home Run", hot),
      play(2, 9, "Single", [pitch({ hitData: { launchSpeed: 94, totalDistance: 120 } })]),
    ]),
  ]);
  const exit = board(boards, "exit").rows;
  assert.equal(exit.length, 2, "one row per batter, not one per batted ball");
  assert.deepEqual(
    exit.map((r) => [r.name, r.value, r.detail]),
    [
      ["B1", "101.0 MPH", "Home Run"],
      ["B2", "94.0 MPH", "Single"],
    ],
  );
}

/* ── Five rows at most, hardest first ───────────────────────────────── */
{
  const boards = feedBoards([
    log(
      [70, 110, 90, 100, 80, 60].map((v, i) =>
        play(i + 1, 9, "Single", [
          pitch({ hitData: { launchSpeed: v, totalDistance: v * 3 } }),
        ]),
      ),
    ),
  ]);
  assert.deepEqual(
    board(boards, "exit").rows.map((r) => r.value),
    ["110.0 MPH", "100.0 MPH", "90.0 MPH", "80.0 MPH", "70.0 MPH"],
  );
  assert.deepEqual(
    board(boards, "distance").rows.map((r) => r.value),
    ["330 FT", "300 FT", "270 FT", "240 FT", "210 FT"],
  );
}

/* ── A whiff is a swing and miss, blocked or tipped — and nothing else ─ */
{
  const call = (code: string) => pitch({ details: { call: { code } } });
  const boards = feedBoards([
    log([
      play(1, 9, "Strikeout", [
        call("S"), // swinging strike
        call("W"), // swinging strike, blocked
        call("T"), // foul tip
        call("C"), // called strike — not a swing
        call("B"), // ball
        call("F"), // foul — contact, not a miss
      ]),
      /* A second at-bat against the same pitcher adds to his count. */
      play(2, 9, "Strikeout", [call("S")]),
      play(3, 8, "Strikeout", [call("S"), call("S")]),
    ]),
  ]);
  assert.deepEqual(
    board(boards, "whiffs").rows.map((r) => [r.name, r.value]),
    [
      ["P9", "4"],
      ["P8", "2"],
    ],
  );
}

/* ── Pitch velocity belongs to the pitcher, and carries the pitch ───── */
{
  const boards = feedBoards([
    log([
      play(1, 9, "Single", [
        pitch({
          pitchData: { startSpeed: 99.7 },
          details: { type: { description: "Four-Seam Fastball" } },
        }),
        pitch({
          pitchData: { startSpeed: 88.1 },
          details: { type: { description: "Slider" } },
        }),
      ]),
    ]),
  ]);
  assert.deepEqual(board(boards, "velo").rows, [
    { personId: 9, name: "P9", value: "99.7 MPH", detail: "Four-Seam Fastball" },
  ]);
}

/* ── A log that never arrived, and untracked events, leave empty boards ─ */
{
  const boards = feedBoards([
    null,
    log([play(1, 9, "Walk", [{ isPitch: false, details: {} }])]),
  ]);
  assert.deepEqual(
    boards.map((b) => b.rows.length),
    [0, 0, 0, 0],
  );
}

/* ── The two day scores ─────────────────────────────────────────────── */
{
  // 3-for-5 with two home runs: TB 9 + RBI 4 + R 2 + BB 0 + SB 1
  assert.equal(
    hitterPoints({ totalBases: 9, rbi: 4, runs: 2, baseOnBalls: 0, stolenBases: 1 }),
    16,
  );
  // A missing figure counts as none rather than poisoning the sum.
  assert.equal(hitterPoints({ totalBases: 4 }), 4);

  // Seven shutout innings, ten punchouts, two hits, one walk.
  // 40 + 2*21 + 10 - 2*1 - 2*2 - 3*0 - 6*0
  assert.equal(
    gameScore({
      outsPitched: 21,
      strikeOuts: 10,
      baseOnBalls: 1,
      hits: 2,
      runs: 0,
      homeRuns: 0,
    }),
    86,
  );
  // Damage costs: same line with three runs on a home run scores lower.
  assert.equal(
    gameScore({
      outsPitched: 21,
      strikeOuts: 10,
      baseOnBalls: 1,
      hits: 2,
      runs: 3,
      homeRuns: 1,
    }),
    71,
  );
}

console.log("gamefeed.check.ts — ok");
