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
import {
  isClub,
  mlb,
  SCHEDULE_HYDRATE,
  toGame,
  type Division,
  type Game,
  type GameSide,
  type StandingRow,
} from "@/lib/mlb";

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

/* ── The real thing, once MLB has scheduled it ──────────────────────── */

/** One postseason series as MLB schedules it. */
export interface PostSeries {
  /** MLB's id — "F_1" to "F_4", "D_1" to "D_4", "L_1", "L_2", "W_1". */
  id: string;
  round: Series["round"];
  /** "ALDS", "NL WILD CARD", "WORLD SERIES" — short enough for a table. */
  label: string;
  best: number;
  games: Game[];
  /** Game 1's sides, the higher seed at home — placeholders until known. */
  home: GameSide;
  away: GameSide;
  /** Games won so far, by club id. */
  wins: Map<number, number>;
  winner: number | null;
}

const ROUND_OF: Record<string, Series["round"]> = { F: "WC", D: "DS", L: "CS", W: "WS" };
const ORDER = ["WC", "DS", "CS", "WS"];

/** Which league a series id belongs to — the AL takes the odd round-one and
 *  division-series ids and L_1, as MLB has numbered them since 2022. */
const leagueOf = (id: string) => (/^(F_[12]|D_[12]|L_1)$/.test(id) ? "AL" : "NL");

/**
 * The round-one ids and the seeds in them: [league, home seed, away seed],
 * league 0 the AL. A division series' away side is a wild-card winner, so
 * only its home seed — the bye — is fixed. Mirrors SLOTS in odds.py.
 */
const SLOTS: Record<string, [number, number, number | null]> = {
  F_1: [0, 3, 6],
  F_2: [0, 4, 5],
  F_3: [1, 3, 6],
  F_4: [1, 4, 5],
  D_1: [0, 1, null],
  D_2: [0, 2, null],
  D_3: [1, 1, null],
  D_4: [1, 2, null],
};

export function toSeries(raw: any): PostSeries {
  const id: string = raw.series?.id ?? "";
  const round = ROUND_OF[id[0]] ?? "WS";
  const games: Game[] = (raw.games ?? []).map(toGame);
  const best = raw.games?.[0]?.gamesInSeries ?? ROUND_LENGTH[round];
  const wins = new Map<number, number>();
  for (const g of games)
    if (g.state === "Final")
      for (const s of [g.home, g.away])
        if (s.isWinner) wins.set(s.id, (wins.get(s.id) ?? 0) + 1);
  const need = Math.floor(best / 2) + 1;
  const winner = [...wins].find(([, w]) => w >= need)?.[0] ?? null;
  const lg = leagueOf(id);
  return {
    id,
    round,
    label: { WC: `${lg} WILD CARD`, DS: `${lg}DS`, CS: `${lg}CS`, WS: "WORLD SERIES" }[round],
    best,
    games,
    home: games[0]?.home,
    away: games[0]?.away,
    wins,
    winner,
  };
}

/** Every series of a season's postseason, first round first, AL before NL. */
export async function getPostseason(season: number): Promise<PostSeries[]> {
  const data = await mlb(
    `/schedule/postseason/series?sportId=1&season=${season}&hydrate=${SCHEDULE_HYDRATE}`,
    60,
  );
  const series: PostSeries[] = (data.series ?? [])
    .map(toSeries)
    .filter((s: PostSeries) => s.home && s.away)
    .sort(
      (a: PostSeries, b: PostSeries) =>
        ORDER.indexOf(a.round) - ORDER.indexOf(b.round) || a.id.localeCompare(b.id),
    );
  nameCsSides(series);
  return series;
}

/** The two division series each LCS draws its sides from. */
const FEEDS: Record<string, [string, string]> = { L_1: ["D_1", "D_2"], L_2: ["D_3", "D_4"] };

/**
 * Until its sides are known MLB calls an LCS "AL Lower Seed v AL Higher
 * Seed" — the better-seeded division-series winner at home, whichever series
 * it came out of. Spell out who each can still be, "TB/CLE/NYY", off every
 * pairing of the two division series' live sides. Seeds come off round one,
 * where all twelve are placed; the World Series ranks by record, not seed, and
 * keeps MLB's name.
 */
export function nameCsSides(series: PostSeries[]): void {
  const seed = new Map<number, number>();
  const abbr = new Map<number, string>();
  for (const s of series)
    for (const side of [s.home, s.away]) if (isClub(side.id)) abbr.set(side.id, side.abbr);
  for (const [id, [, home, away]] of Object.entries(SLOTS)) {
    const s = series.find((x) => x.id === id);
    if (!s) continue;
    seed.set(s.home.id, home);
    if (away !== null) seed.set(s.away.id, away);
  }

  for (const [cs, feeds] of Object.entries(FEEDS)) {
    const s = series.find((x) => x.id === cs);
    const alive = feeds.map((id) => {
      const d = series.find((x) => x.id === id);
      return !d ? [] : d.winner ? [d.winner] : [d.home.id, d.away.id];
    });
    /* A wild card still undecided leaves a division series with a
       placeholder side, and no seed to rank it by. */
    if (!s || alive.some((a) => a.length === 0 || a.some((id) => !seed.has(id)))) continue;

    const high = new Set<number>();
    const low = new Set<number>();
    for (const a of alive[0])
      for (const b of alive[1]) {
        const [h, l] = seed.get(a)! < seed.get(b)! ? [a, b] : [b, a];
        high.add(h);
        low.add(l);
      }
    const label = (ids: Set<number>) =>
      [...ids].sort((a, b) => seed.get(a)! - seed.get(b)!).map((id) => abbr.get(id)).join("/");

    for (const g of s.games)
      for (const side of [g.home, g.away])
        if (!isClub(side.id) && /higher|lower/i.test(side.name))
          side.abbr = label(/higher/i.test(side.name) ? high : low);
  }
}

/** MLB has named all twelve clubs — the postseason is set, if not begun. */
export const fieldSet = (series: PostSeries[]): boolean =>
  Object.keys(SLOTS).every((id) => {
    const s = series.find((x) => x.id === id);
    return !!s && isClub(s.home.id) && (id[0] === "D" || isClub(s.away.id));
  });

/**
 * Both leagues' seeds as MLB actually set them, AL first, off the round-one
 * series — tiebreakers and all, which the standings-only seeding above can
 * get wrong. Null until the field is set.
 */
export function realSeeds(series: PostSeries[], divisions: Division[]): Seed[][] | null {
  if (!fieldSet(series)) return null;
  const rows = new Map(divisions.flatMap((d) => d.teams).map((t) => [t.id, t]));
  const out: Seed[][] = [[], []];
  for (const [id, [lg, home, away]] of Object.entries(SLOTS)) {
    const s = series.find((x) => x.id === id)!;
    for (const [seed, side] of [
      [home, s.home],
      [away, s.away],
    ] as const) {
      if (seed === null) continue;
      const team = rows.get(side.id);
      if (!team) return null;
      out[lg][seed - 1] = { seed, team, champion: seed <= 3, bye: seed <= BYES };
    }
  }
  return out;
}

/** Where a series stands, as a line — "NYY LEADS 2-1", "TIED 1-1", "LAD WINS 4-3". */
export function seriesLine(s: PostSeries): string {
  const h = s.wins.get(s.home.id) ?? 0;
  const a = s.wins.get(s.away.id) ?? 0;
  if (h + a === 0) return "";
  if (h === a) return `TIED (${h}-${a})`;
  const [lead, hi, lo] = h > a ? [s.home, h, a] : [s.away, a, h];
  return `${lead.abbr} ${s.winner ? "WINS" : "LEADS"} (${hi}-${lo})`;
}

/**
 * Where one club's October stands: the last series it is in, and how.
 * "WON WORLD SERIES 4-3", "LEADS ALCS 2-1", "LOST NL WILD CARD 0-2", "BYE".
 */
export function clubLine(series: PostSeries[], id: number): string {
  const s = [...series].reverse().find((x) => x.home.id === id || x.away.id === id);
  if (!s) return "";
  const us = s.wins.get(id) ?? 0;
  const them = s.wins.get(s.home.id === id ? s.away.id : s.home.id) ?? 0;
  if (s.winner) return `${s.winner === id ? "WON" : "LOST"} ${s.label} ${us}-${them}`;
  if (us + them === 0) return s.round === "DS" && !isClub(s.away.id) ? "BYE" : `PLAYS ${s.label}`;
  return `${us > them ? "LEADS" : us < them ? "TRAILS" : "TIED"} ${s.label} ${us}-${them}`;
}
