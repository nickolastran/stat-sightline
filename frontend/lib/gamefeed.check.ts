/*
 * Self-check for the game feed's one piece of real logic: folding a day of
 * play logs and win probability lines into the tracked boards, and ranking a
 * whole-league day of one box score figure.
 *
 * What can silently go wrong here is a board that ranks one player's five
 * best marks instead of five players, a whiff count that misses the blocked
 * and tipped calls, and a win probability swing credited to the side that
 * lost by it — all of which read as plausible numbers on the page.
 *
 * Run with:  npx tsx lib/gamefeed.check.ts
 */
import assert from "node:assert/strict";
import { feedBoards } from "./gamefeed";

const pitch = (o: Record<string, unknown>) => ({ isPitch: true, ...o });

const log = (plays: unknown[]) => ({ allPlays: plays });

const play = (
  batter: number,
  pitcher: number,
  events: unknown[],
  eventType?: string,
) => ({
  matchup: {
    batter: { id: batter, fullName: `B${batter}` },
    pitcher: { id: pitcher, fullName: `P${pitcher}` },
  },
  playEvents: events,
  ...(eventType ? { result: { eventType } } : {}),
});

/** One line of a win probability log: who batted, who pitched, which half,
 *  what it moved the home club's chances by. */
const wp = (batter: number, pitcher: number, top: boolean, homeAdded: number) => ({
  about: { isTopInning: top },
  matchup: {
    batter: { id: batter, fullName: `B${batter}` },
    pitcher: { id: pitcher, fullName: `P${pitcher}` },
  },
  homeTeamWinProbabilityAdded: homeAdded,
});

const board = (boards: ReturnType<typeof feedBoards>, code: string) =>
  boards.find((b) => b.code === code)!;

/* ── A board ranks players, not one player's best five ──────────────── */
{
  const hot = [101, 99, 97, 95, 93].map((v) =>
    pitch({ hitData: { launchSpeed: v, totalDistance: 300 } }),
  );
  const boards = feedBoards(
    [
      log([
        play(1, 9, hot),
        play(2, 9, [pitch({ hitData: { launchSpeed: 94, totalDistance: 120 } })]),
      ]),
    ],
    [],
  );
  assert.deepEqual(
    board(boards, "exit").rows.map((r) => [r.name, r.value]),
    [
      ["B1", "101.0 MPH"],
      ["B2", "94.0 MPH"],
    ],
    "one row per batter, not one per batted ball",
  );
}

/* ── Five rows at most, hardest first ───────────────────────────────── */
{
  const boards = feedBoards(
    [
      log(
        [70, 110, 90, 100, 80, 60].map((v, i) =>
          play(i + 1, 9, [
            pitch({ hitData: { launchSpeed: v, totalDistance: v * 3 } }),
          ]),
        ),
      ),
    ],
    [],
  );
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
  const boards = feedBoards(
    [
      log([
        play(1, 9, [
          call("S"), // swinging strike
          call("W"), // swinging strike, blocked
          call("T"), // foul tip
          call("C"), // called strike — not a swing
          call("B"), // ball
          call("F"), // foul — contact, not a miss
        ]),
        /* A second at-bat against the same pitcher adds to his count. */
        play(2, 9, [call("S")]),
        play(3, 8, [call("S"), call("S")]),
      ]),
    ],
    [],
  );
  assert.deepEqual(
    board(boards, "whiffs").rows.map((r) => [r.name, r.value]),
    [
      ["P9", "4"],
      ["P8", "2"],
    ],
  );
}

/* ── Pitch velocity belongs to the pitcher ──────────────────────────── */
{
  const boards = feedBoards(
    [
      log([
        play(1, 9, [
          pitch({ pitchData: { startSpeed: 99.7 } }),
          pitch({ pitchData: { startSpeed: 88.1 } }),
        ]),
      ]),
    ],
    [],
  );
  assert.deepEqual(board(boards, "velo").rows, [
    { personId: 9, name: "P9", value: "99.7 MPH" },
  ]);
}

/* ── A win probability swing belongs to whoever's half it was, and costs
      the pitcher exactly what it paid the batter ─────────────────────── */
{
  const boards = feedBoards(
    [],
    [
      [
        /* Home batter: the home club's gain is his. */
        wp(1, 8, false, 12.5),
        wp(1, 8, false, 5.0),
        /* Away batter: the home club's loss is his gain. */
        wp(2, 9, true, -20.0),
        /* An out costs the man who made it and pays the man who got it. */
        wp(3, 9, true, 8.0),
        { matchup: {}, homeTeamWinProbabilityAdded: 99 }, // nobody — dropped
      ],
    ],
  );
  assert.deepEqual(
    board(boards, "wpa").rows.map((r) => [r.name, r.value]),
    [
      ["B2", "0.200"],
      ["B1", "0.175"],
      ["B3", "-0.080"],
    ],
  );
  assert.deepEqual(
    board(boards, "pwpa").rows.map((r) => [r.name, r.value]),
    [
      /* P9 gave up .200 and got back .080; P8 gave up both home swings. */
      ["P9", "-0.120"],
      ["P8", "-0.175"],
    ],
  );
}

/* ── A log that never arrived, and untracked events, leave empty boards ─ */
{
  const boards = feedBoards(
    [null, log([play(1, 9, [{ isPitch: false, details: {} }])])],
    [null],
  );
  assert.deepEqual(
    boards.map((b) => b.rows.length),
    [0, 0, 0, 0, 0, 0, 0, 0],
  );
}

/* ── Hits and strikeouts, counted off the log while the game is on ───── */
{
  const boards = feedBoards(
    [
      log([
        play(1, 9, [], "single"),
        play(1, 9, [], "home_run"),
        play(1, 9, [], "walk"),
        play(2, 9, [], "double"),
        play(2, 8, [], "triple"),
        play(3, 9, [], "strikeout"),
        play(4, 9, [], "strikeout_double_play"),
        play(5, 8, [], "field_out"),
        /* The at-bat on the screen right now — no result, nothing counted. */
        play(6, 8, [pitch({ pitchData: { startSpeed: 98 } })]),
      ]),
    ],
    [],
  );
  assert.deepEqual(
    board(boards, "hits").rows.map((r) => [r.name, r.value]),
    [
      ["B1", "2"],
      ["B2", "2"],
    ],
    "the walk is not a hit, and the live at-bat has yet to be one",
  );
  assert.deepEqual(
    board(boards, "strikeouts").rows.map((r) => [r.name, r.value]),
    [["P9", "2"]],
    "the strikeout double play is still a strikeout, and the ground-out is not",
  );
}

console.log("gamefeed.check.ts — ok");
