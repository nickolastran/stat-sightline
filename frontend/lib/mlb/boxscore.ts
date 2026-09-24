/* One game's box score. */
import {
  mlb,
} from "./core";
import {
  type TeamStatCol,
  type TeamStatValue,
} from "./stats";


/* ── Box score ──────────────────────────────────────────────────────── */

export interface BoxBatter {
  id: number;
  name: string;
  pos: string;
  /** Spot in the order, 1-9. */
  order: number;
  /** Entered mid-game — indented under the starter it replaced, savant-style. */
  sub: boolean;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  hr: number;
  bb: number;
  k: number;
  avg: string; // season, not game
  ops: string; // season, not game
}

export interface BoxPitcher {
  id: number;
  name: string;
  /** "(W, 11-5)" / "(L, 4-2)" / "(S, 21)" when this pitcher got the decision. */
  decision: string;
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitches: number;
  strikes: number;
  era: string; // season
}

export interface BoxTeam {
  id: number;
  name: string;
  abbr: string;
  runs: number | null;
  hits: number | null;
  errors: number | null;
  lob: number | null;
  /** The club's running totals, the figures the two sides are compared on. */
  totals: Record<"hitting" | "pitching", Record<string, TeamStatValue>>;
  batters: BoxBatter[];
  pitchers: BoxPitcher[];
}

/* What a live game compares the two clubs on — the counting stats that move
   during a game, not the rates that need a season to mean anything. */
export const TOTAL_ROWS: Record<"hitting" | "pitching", TeamStatCol[]> = {
  hitting: [
    { key: "hits", label: "HITS", title: "Hits" },
    { key: "homeRuns", label: "HOME RUNS", title: "Home runs" },
    { key: "totalBases", label: "TOTAL BASES", title: "Total bases" },
    { key: "baseOnBalls", label: "WALKS", title: "Walks drawn" },
    { key: "strikeOuts", label: "STRIKEOUTS", title: "Strikeouts taken" },
    { key: "leftOnBase", label: "RUNNERS LOB", title: "Runners left on base" },
  ],
  pitching: [
    { key: "strikeOuts", label: "STRIKEOUTS", title: "Strikeouts recorded" },
    { key: "baseOnBalls", label: "WALKS", title: "Walks issued" },
    { key: "hits", label: "HITS", title: "Hits allowed" },
    { key: "runs", label: "RUNS", title: "Runs allowed" },
    { key: "earnedRuns", label: "EARNED RUNS", title: "Earned runs allowed" },
    { key: "homeRuns", label: "HOME RUNS", title: "Home runs allowed" },
  ],
};

export interface BoxInning {
  num: number;
  away: number | null;
  home: number | null;
}

export interface BoxScore {
  pk: number;
  scheduledInnings: number;
  innings: BoxInning[];
  away: BoxTeam;
  home: BoxTeam;
}

const total = (stat: any, group: "hitting" | "pitching") =>
  Object.fromEntries(
    TOTAL_ROWS[group].map((c) => [c.key, stat?.[c.key] ?? null]),
  );

/** A starter's battingOrder is a round hundred ("100"); subs are "101", "102". */
const isSub = (order: string | undefined) => !!order && !/00$/.test(order);

function boxTeam(raw: any, line: any): BoxTeam {
  const players = raw.players ?? {};
  const at = (id: number) => players[`ID${id}`] ?? {};
  return {
    id: raw.team?.id,
    name: raw.team?.name ?? "—",
    abbr: raw.team?.abbreviation ?? "—",
    runs: line?.runs ?? null,
    hits: line?.hits ?? null,
    errors: line?.errors ?? null,
    lob: line?.leftOnBase ?? null,
    totals: {
      hitting: total(raw.teamStats?.batting, "hitting"),
      pitching: total(raw.teamStats?.pitching, "pitching"),
    },
    /* `batters` also carries every pitcher who appeared, batting order or not.
       No battingOrder means the club never sent them to the plate, so they are
       not part of the batting line. */
    batters: (raw.batters ?? [])
      .filter((id: number) => at(id).battingOrder)
      .map((id: number): BoxBatter => {
        const p = at(id);
        const s = p.stats?.batting ?? {};
        return {
          id,
          name: p.person?.fullName ?? "—",
          pos: p.position?.abbreviation ?? "",
          order: Math.floor(Number(p.battingOrder) / 100),
          sub: isSub(p.battingOrder),
          ab: s.atBats ?? 0,
          r: s.runs ?? 0,
          h: s.hits ?? 0,
          rbi: s.rbi ?? 0,
          hr: s.homeRuns ?? 0,
          bb: s.baseOnBalls ?? 0,
          k: s.strikeOuts ?? 0,
          avg: p.seasonStats?.batting?.avg ?? "—",
          ops: p.seasonStats?.batting?.ops ?? "—",
        };
      }),
    pitchers: (raw.pitchers ?? []).map((id: number): BoxPitcher => {
      const p = at(id);
      const s = p.stats?.pitching ?? {};
      return {
        id,
        name: p.person?.fullName ?? "—",
        decision: s.note ?? "",
        ip: s.inningsPitched ?? "0.0",
        h: s.hits ?? 0,
        r: s.runs ?? 0,
        er: s.earnedRuns ?? 0,
        bb: s.baseOnBalls ?? 0,
        k: s.strikeOuts ?? 0,
        hr: s.homeRuns ?? 0,
        pitches: s.pitchesThrown ?? s.numberOfPitches ?? 0,
        strikes: s.strikes ?? 0,
        era: p.seasonStats?.pitching?.era ?? "—",
      };
    }),
  };
}

/**
 * Full box score for one game: inning-by-inning line plus both teams' batting
 * and pitching lines. Boxscore and linescore are separate endpoints, so they
 * are fetched together and merged. Short revalidate — a live game moves.
 */
export async function getBoxScore(pk: number): Promise<BoxScore> {
  const [box, line] = await Promise.all([
    mlb(`/game/${pk}/boxscore`, 30),
    mlb(`/game/${pk}/linescore`, 30),
  ]);
  return {
    pk,
    scheduledInnings: line.scheduledInnings ?? 9,
    innings: (line.innings ?? []).map(
      (i: any): BoxInning => ({
        num: i.num,
        away: i.away?.runs ?? null,
        home: i.home?.runs ?? null,
      }),
    ),
    away: boxTeam(box.teams?.away ?? {}, line.teams?.away),
    home: boxTeam(box.teams?.home ?? {}, line.teams?.home),
  };
}
