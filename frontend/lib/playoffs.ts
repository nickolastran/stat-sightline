/*
 * The postseason field, worked out from the standings.
 *
 * MLB publishes seeds only once October arrives, so from April to September
 * this is the bracket as the standings say it would be if the season ended
 * today — which is the whole point of looking at one in August. The rule is
 * the same either way: three division winners seeded 1-3 by record, then the
 * three best clubs left as seeds 4-6.
 *
 * Pure functions over rows the caller already has, so the bracket renders off
 * MLB's own standings and needs neither our projection API nor a model.
 */
import type { Division, StandingRow } from "@/lib/mlb";

/** Clubs per league in the field, and how many skip the first round. */
export const BERTHS = 6;
export const BYES = 2;
const DIVISIONS_PER_LEAGUE = 3;

export interface Seed {
  seed: number;
  team: StandingRow;
  /** Won a division, as opposed to taking a wild card. */
  champion: boolean;
  /** Seeded 1 or 2, so through to the division series without playing. */
  bye: boolean;
}

/** Better record first — the only order any of this is decided by. */
const byRecord = (a: StandingRow, b: StandingRow) =>
  b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name);

/**
 * One league's six seeds, best first.
 *
 * A division winner outranks every club that didn't win one, however good its
 * record — a 104-win wild card is still the 4 seed. That is why the winners
 * are drawn off first rather than the whole league being sorted at once.
 */
export function seedLeague(divisions: Division[]): Seed[] {
  const winners = divisions
    .map((d) => [...d.teams].sort(byRecord)[0])
    .filter(Boolean)
    .sort(byRecord)
    .slice(0, DIVISIONS_PER_LEAGUE);

  const won = new Set(winners.map((t) => t.id));
  const wild = divisions
    .flatMap((d) => d.teams)
    .filter((t) => !won.has(t.id))
    .sort(byRecord)
    .slice(0, BERTHS - winners.length);

  return [...winners, ...wild].map((team, i) => ({
    seed: i + 1,
    team,
    champion: won.has(team.id),
    bye: i < BYES,
  }));
}

/** Both leagues' fields, American first — the order a bracket is drawn in. */
export function seedField(divisions: Division[]): { leagueId: number; league: string; seeds: Seed[] }[] {
  const leagues = [...new Set(divisions.map((d) => d.leagueId))].sort();
  return leagues.map((leagueId) => {
    const own = divisions.filter((d) => d.leagueId === leagueId);
    return {
      leagueId,
      league: own[0]?.league ?? "",
      seeds: seedLeague(own),
    };
  });
}

/** One side of a series: a seeded club, or the slot a winner will fill. */
export type Side = { seed: Seed } | { pending: string };

export interface Series {
  /** "WC", "DS", "CS", "WS" — which round, and so how long it runs. */
  round: "WC" | "DS" | "CS" | "WS";
  label: string;
  best: number;
  home: Side;
  away: Side;
}

export const isSeeded = (s: Side): s is { seed: Seed } => "seed" in s;

/** Games in each round, which is also what a bracket box prints under itself. */
export const ROUND_LENGTH: Record<Series["round"], number> = {
  WC: 3,
  DS: 5,
  CS: 7,
  WS: 7,
};

/**
 * One league's bracket: two wild-card series, the two division series they
 * feed, and the championship series.
 *
 * The pairing is MLB's, and it does not reseed: the 1 seed draws the winner
 * of 4-5 and the 2 seed the winner of 3-6, so a bracket drawn the other way
 * round sends the wrong clubs to the wrong side of it.
 */
export function leagueBracket(seeds: Seed[]): {
  wc: Series[];
  ds: Series[];
  cs: Series | null;
} {
  if (seeds.length < BERTHS) return { wc: [], ds: [], cs: null };
  const [one, two, three, four, five, six] = seeds;

  const wc: Series[] = [
    { round: "WC", label: "WILD CARD", best: 3, home: { seed: three }, away: { seed: six } },
    { round: "WC", label: "WILD CARD", best: 3, home: { seed: four }, away: { seed: five } },
  ];
  const ds: Series[] = [
    {
      round: "DS",
      label: "DIVISION SERIES",
      best: 5,
      home: { seed: one },
      away: { pending: `${four.seed}/${five.seed} WINNER` },
    },
    {
      round: "DS",
      label: "DIVISION SERIES",
      best: 5,
      home: { seed: two },
      away: { pending: `${three.seed}/${six.seed} WINNER` },
    },
  ];
  const cs: Series = {
    round: "CS",
    label: "CHAMPIONSHIP SERIES",
    best: 7,
    home: { pending: "DS WINNER" },
    away: { pending: "DS WINNER" },
  };
  return { wc, ds, cs };
}
