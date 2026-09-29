import { mlb, type Leaderboard, type LeaderRow } from "@/lib/mlb";
import { playSwings, WP_FIELDS } from "@/lib/gamefeed";

/*
 * Championship win probability added — a play's WPA scaled by how much the
 * game it came in moves its club's chance at the title. A walk-off in a World
 * Series Game 7 is worth a whole championship; the same swing in a Wild Card
 * opener is worth a sliver of one.
 *
 * ponytail: every game a coin flip, the way cWPA is usually figured — so a
 * game's stake is read off the series score and the rounds left, not who is
 * playing. Swap in team strength if the boards ever need to argue with
 * FanGraphs to the decimal.
 */

/** Rounds still to win after this one, by MLB's postseason game type. */
const ROUNDS_AFTER: Record<string, number> = { F: 3, D: 2, L: 1, W: 0 };

/** Chance of winning `need` more games before losing `spare` more, 50/50 each. */
export function seriesOdds(need: number, spare: number): number {
  if (need <= 0) return 1;
  if (spare <= 0) return 0;
  return (seriesOdds(need - 1, spare) + seriesOdds(need, spare - 1)) / 2;
}

/**
 * What one game is worth in championships: the title odds of a club that
 * wins it less those of one that loses it. The same for both clubs — one's
 * gain is the other's loss.
 *
 * `wins`/`losses` are the series score before the game, from either side.
 */
export function gameStake(
  gameType: string,
  gamesInSeries: number,
  wins: number,
  losses: number,
): number {
  const after = ROUNDS_AFTER[gameType];
  if (after === undefined) return 0;
  const toWin = Math.ceil(gamesInSeries / 2);
  const won = seriesOdds(toWin - wins - 1, toWin - losses);
  const lost = seriesOdds(toWin - wins, toWin - losses - 1);
  return (won - lost) * 0.5 ** after;
}

/**
 * The series score going into a game, off its schedule row. A final row
 * already counts the game in the club's record, so its result comes back off;
 * a game still being played hasn't been counted yet.
 */
function scoreBefore(g: any): [number, number] {
  const home = g.teams?.home ?? {};
  const w = home.leagueRecord?.wins ?? 0;
  const l = home.leagueRecord?.losses ?? 0;
  if (g.status?.abstractGameState !== "Final") return [w, l];
  return home.isWinner ? [w - 1, l] : [w, l - 1];
}

/** One player's running cWPA, before it is ranked. */
interface Mark {
  personId: number;
  name: string;
  team: string;
  value: number;
}

/** The top `limit` of a total, ranked with ties sharing a number. */
function rank(marks: Map<number, Mark>, limit: number): LeaderRow[] {
  const all = [...marks.values()].sort((a, b) => b.value - a.value);
  const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;
  return all.slice(0, limit).map((m) => ({
    rank: all.findIndex((x) => fmt(x.value) === fmt(m.value)) + 1,
    personId: m.personId,
    name: m.name,
    team: m.team,
    value: fmt(m.value),
  }));
}

/**
 * Batter and pitcher cWPA totals over a postseason's schedule rows and each
 * started game's win probability line (same order, null where it couldn't be
 * had). Pure, so the stake and the sign can be checked without an October.
 */
export function cwpaTotals(games: any[], wpLogs: unknown[]) {
  const bat = new Map<number, Mark>();
  const arm = new Map<number, Mark>();
  const add = (at: Map<number, Mark>, p: any, team: string, by: number) => {
    const m = at.get(p.id) ?? { personId: p.id, name: p.fullName ?? "—", team, value: 0 };
    m.value += by;
    at.set(p.id, m);
  };

  games.forEach((g, i) => {
    const [w, l] = scoreBefore(g);
    const stake = gameStake(g.gameType, g.gamesInSeries ?? 0, w, l);
    const away = g.teams?.away?.team?.name ?? "";
    const home = g.teams?.home?.team?.name ?? "";
    for (const s of playSwings(wpLogs[i])) {
      /* The top half is the away club batting. */
      const [batFor, armFor] = s.top ? [away, home] : [home, away];
      if (s.batter?.id) add(bat, s.batter, batFor, s.batting * stake);
      if (s.pitcher?.id) add(arm, s.pitcher, armFor, -s.batting * stake);
    }
  });
  return { bat, arm };
}

/** The two cWPA cards that open the postseason leaders, hitting and pitching. */
export async function getCwpaBoards(
  season: number,
  limit = 20,
): Promise<Leaderboard[]> {
  const data = await mlb(
    `/schedule?sportId=1&season=${season}&gameType=F,D,L,W&hydrate=team`,
    300,
  );
  const games = ((data.dates ?? []) as any[])
    .flatMap((d) => d.games ?? [])
    .filter((g) => g.status?.abstractGameState !== "Preview");
  const wpLogs = await Promise.all(
    games.map((g) =>
      mlb(`/game/${g.gamePk}/winProbability?fields=${WP_FIELDS}`, 300).catch(
        () => null,
      ),
    ),
  );
  const { bat, arm } = cwpaTotals(games, wpLogs);
  const board = (group: "hitting" | "pitching", marks: Map<number, Mark>) => ({
    code: `${group}.cwpa`,
    label: "cWPA",
    group,
    /* No player-table column to hand off to — the card is the whole board. */
    stat: null,
    leaders: rank(marks, limit),
  });
  return [board("hitting", bat), board("pitching", arm)];
}
