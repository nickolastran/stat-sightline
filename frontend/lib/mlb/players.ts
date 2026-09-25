/* A player's summary line and individual stat tables. */
import {
  mlb,
} from "./core";
import {
  inRotation,
  type TeamStatCol,
  teamStatNum,
  type TeamStatValue,
} from "./stats";


/* ── Player summary ─────────────────────────────────────────────────── */

export interface StatLine {
  group: "hitting" | "pitching";
  team: string;
  /** (label, value) in display order — the first four are the headline tiles. */
  stats: [string, string][];
}

export interface PlayerSummary {
  id: number;
  name: string;
  number: string;
  pos: string;
  team: string;
  teamId: number | null;
  bats: string;
  throws: string;
  age: number | null;
  height: string;
  weight: number | null;
  debut: string;
  /** Empty when the player has no line in this season (a two-way player has two). */
  lines: StatLine[];
}

/* (label, statcast/statsapi key). Order matters: first four → MetricCards. */
const HITTING_KEYS: [string, string][] = [
  ["AVG", "avg"],
  ["HR", "homeRuns"],
  ["RBI", "rbi"],
  ["OPS", "ops"],
  ["G", "gamesPlayed"],
  ["PA", "plateAppearances"],
  ["AB", "atBats"],
  ["H", "hits"],
  ["2B", "doubles"],
  ["3B", "triples"],
  ["R", "runs"],
  ["BB", "baseOnBalls"],
  ["K", "strikeOuts"],
  ["SB", "stolenBases"],
  ["OBP", "obp"],
  ["SLG", "slg"],
];

const PITCHING_KEYS: [string, string][] = [
  ["ERA", "era"],
  ["W-L", "record"], // synthesized below
  ["K", "strikeOuts"],
  ["WHIP", "whip"],
  ["G", "gamesPlayed"],
  ["GS", "gamesStarted"],
  ["SV", "saves"],
  ["IP", "inningsPitched"],
  ["H", "hits"],
  ["ER", "earnedRuns"],
  ["HR", "homeRuns"],
  ["BB", "baseOnBalls"],
  ["K/9", "strikeoutsPer9Inn"],
  ["BB/9", "walksPer9Inn"],
  ["OAVG", "avg"],
  ["P", "numberOfPitches"],
];

/**
 * One player's identity plus their season hitting and/or pitching line, as
 * rendered by /player/[id]. Returns null for an unknown id so the route can
 * 404 instead of throwing. Season stats move once a day at most — long
 * revalidate.
 */
export async function getPlayer(
  id: number,
  season: number,
): Promise<PlayerSummary | null> {
  const data = await mlb(
    `/people/${id}?hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`,
    1800,
  ).catch((e: Error) => {
    // Unknown id → null so the route 404s; anything else is an outage and
    // must surface as one, not as "no such player".
    if (e.message.includes(" 404:")) return null;
    throw e;
  });
  const p = data?.people?.[0];
  if (!p) return null;

  const lines: StatLine[] = [];
  for (const s of (p.stats ?? []) as any[]) {
    const group = s.group?.displayName;
    if (group !== "hitting" && group !== "pitching") continue;
    const split = s.splits?.[0];
    if (!split) continue;
    const stat = { ...split.stat };
    // A pitcher who never came to the plate still gets an all-zero hitting
    // split back. No plate appearances, no hitting line.
    if (group === "hitting" && !stat.plateAppearances) continue;
    stat.record = `${stat.wins ?? 0}-${stat.losses ?? 0}`;
    const keys = group === "hitting" ? HITTING_KEYS : PITCHING_KEYS;
    lines.push({
      group,
      team: split.team?.name ?? "",
      stats: keys.map(([label, key]) => [
        label,
        stat[key] === undefined || stat[key] === null ? "—" : String(stat[key]),
      ]),
    });
  }

  return {
    id: p.id,
    name: p.fullName ?? "—",
    number: p.primaryNumber ?? "",
    pos: p.primaryPosition?.abbreviation ?? "",
    team: p.currentTeam?.name ?? "",
    teamId: p.currentTeam?.id ?? null,
    bats: p.batSide?.code ?? "?",
    throws: p.pitchHand?.code ?? "?",
    age: p.currentAge ?? null,
    height: p.height ?? "",
    weight: p.weight ?? null,
    debut: p.mlbDebutDate ?? "",
    lines,
  };
}

/**
 * Every major-league season the player has a hitting or pitching line in,
 * newest first — the seasons /player/[id] will actually find stats for. A
 * traded player has one split per club in a season, so the years are deduped.
 * Empty for an unknown id or a player who has never appeared in one, which
 * the page reads as "current season only". A career only gains a season a
 * year, so this caches for a day.
 */
export async function getPlayerSeasons(id: number): Promise<number[]> {
  const data = await mlb(
    `/people/${id}/stats?stats=yearByYear&group=hitting,pitching&sportId=1`,
    86400,
  ).catch((e: Error) => {
    if (e.message.includes(" 404:")) return null;
    throw e;
  });

  const seasons = new Set<number>();
  for (const s of (data?.stats ?? []) as any[]) {
    for (const split of (s.splits ?? []) as any[]) {
      // sportId above filters the request, but a hydrated split can still
      // carry a minor-league team — keep only what the MLB pages can show.
      if (split.sport?.id !== undefined && split.sport.id !== 1) continue;
      const year = Number(split.season);
      if (Number.isInteger(year)) seasons.add(year);
    }
  }
  return [...seasons].sort((a, b) => b - a);
}

/* ── Individual player stats ────────────────────────────────────────── */

/**
 * Which slice of the calendar a player-stat view reads. Wider than the
 * standings' game type: a club's players have a post-season line, its
 * standings row does not.
 */
export type PlayerGameType = "R" | "P" | "S";

export const PLAYER_GAME_TYPES: { value: PlayerGameType; label: string }[] = [
  { value: "R", label: "REGULAR SEASON" },
  { value: "P", label: "POSTSEASON" },
  { value: "S", label: "SPRING TRAINING" },
];

export const pickPlayerGameType = (raw: string | undefined): PlayerGameType =>
  raw === "P" || raw === "S" ? raw : "R";

export type StatGroup = "hitting" | "pitching" | "fielding";

/** One player's line in one group — a row of the stats tab's tables. */
export interface PlayerStatRow {
  id: number;
  name: string;
  /** Fielding is reported per position, so a player has a row for each. */
  position: string;
  values: Record<string, TeamStatValue>;
}

/* The columns each table carries, in the order MLB's own lines read. */
export const PLAYER_HITTING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games played" },
  { key: "plateAppearances", label: "PA", title: "Plate appearances" },
  { key: "atBats", label: "AB", title: "At-bats" },
  /* The four rates ride with the at-bats they are figured from, ahead of the
     counting stats — a line is read for them first. */
  { key: "avg", label: "AVG", title: "Batting average — hits per at-bat" },
  { key: "obp", label: "OBP", title: "On-base percentage" },
  { key: "slg", label: "SLG", title: "Slugging percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
  { key: "runs", label: "R", title: "Runs scored" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "doubles", label: "2B", title: "Doubles" },
  { key: "triples", label: "3B", title: "Triples" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "K", title: "Strikeouts" },
  { key: "stolenBases", label: "SB", title: "Stolen bases" },
];

export const PLAYER_PITCHING_COLS: TeamStatCol[] = [
  { key: "gamesPlayed", label: "G", title: "Games pitched" },
  { key: "gamesStarted", label: "GS", title: "Games started" },
  { key: "wins", label: "W", title: "Wins" },
  { key: "losses", label: "L", title: "Losses" },
  { key: "saves", label: "SV", title: "Saves" },
  { key: "era", label: "ERA", title: "Earned run average" },
  { key: "whip", label: "WHIP", title: "Walks and hits per inning pitched" },
  { key: "inningsPitched", label: "IP", title: "Innings pitched" },
  { key: "hits", label: "H", title: "Hits allowed" },
  { key: "runs", label: "R", title: "Runs allowed" },
  { key: "earnedRuns", label: "ER", title: "Earned runs allowed" },
  { key: "homeRuns", label: "HR", title: "Home runs allowed" },
  { key: "baseOnBalls", label: "BB", title: "Walks issued" },
  { key: "strikeOuts", label: "K", title: "Strikeouts recorded" },
  { key: "avg", label: "OAVG", title: "Opponent batting average" },
  {
    key: "strikeoutsPer9Inn",
    label: "K/9",
    title: "Strikeouts per nine innings",
  },
];

export const PLAYER_FIELDING_COLS: TeamStatCol[] = [
  { key: "games", label: "G", title: "Games at this position" },
  { key: "gamesStarted", label: "GS", title: "Games started at this position" },
  { key: "innings", label: "INN", title: "Innings played at this position" },
  { key: "chances", label: "TC", title: "Total chances" },
  { key: "putOuts", label: "PO", title: "Putouts" },
  { key: "assists", label: "A", title: "Assists" },
  { key: "fielding", label: "FPCT", title: "Fielding percentage" },
  { key: "errors", label: "E", title: "Errors" },
  { key: "doublePlays", label: "DP", title: "Double plays turned" },
  {
    key: "rangeFactorPer9Inn",
    label: "RF/9",
    title: "Range factor per nine innings",
  },
];

/* Innings are thirds: "121.2" is 121 innings and two outs, so they are added
   as outs and written back in the same form rather than as decimals. */
/**
 * Outs behind an innings figure. MLB writes innings in thirds — "7.1" is
 * seven and a third, not seven and a tenth — so anything that adds or
 * averages innings has to come through here first.
 */
export const outsOf = (v: TeamStatValue): number => {
  const n = teamStatNum(v);
  if (n === null) return 0;
  const whole = Math.trunc(n);
  return whole * 3 + Math.round((n - whole) * 10);
};

export const inningsOf = (outs: number): string =>
  `${Math.floor(outs / 3)}.${outs % 3}`;

/**
 * One row per player rather than one per position. MLB reports fielding per
 * position, so a shortstop who filled in at second arrives twice and neither
 * line is his season; the counting stats add up, the rates are recomputed from
 * the totals (an average of two percentages isn't one), and the position shown
 * is where he played the most innings, starred if there were others.
 */
export function mergeFielding(rows: PlayerStatRow[]): PlayerStatRow[] {
  const SUM = [
    "games",
    "gamesStarted",
    "chances",
    "putOuts",
    "assists",
    "errors",
    "doublePlays",
  ];
  const byPlayer = new Map<
    number,
    { row: PlayerStatRow; outs: number; spots: { pos: string; outs: number }[] }
  >();

  for (const r of rows) {
    const outs = outsOf(r.values.innings);
    const seen = byPlayer.get(r.id);
    if (!seen) {
      byPlayer.set(r.id, {
        row: { ...r, values: { ...r.values } },
        outs,
        spots: [{ pos: r.position, outs }],
      });
      continue;
    }
    for (const k of SUM)
      seen.row.values[k] =
        (teamStatNum(seen.row.values[k]) ?? 0) +
        (teamStatNum(r.values[k]) ?? 0);
    seen.outs += outs;
    seen.spots.push({ pos: r.position, outs });
  }

  return [...byPlayer.values()].map(({ row, outs, spots }) => {
    const po = teamStatNum(row.values.putOuts) ?? 0;
    const assists = teamStatNum(row.values.assists) ?? 0;
    const errors = teamStatNum(row.values.errors) ?? 0;
    /* Chances go unreported often enough that the sum of the three is the
       safer denominator; it is what a total chance is. */
    const tc = Math.max(
      teamStatNum(row.values.chances) ?? 0,
      po + assists + errors,
    );
    row.position = spots.reduce((a, b) => (b.outs > a.outs ? b : a)).pos;
    row.values.innings = inningsOf(outs);
    row.values.chances = tc;
    row.values.fielding = tc
      ? ((po + assists) / tc).toFixed(3).replace(/^0/, "")
      : null;
    row.values.rangeFactorPer9Inn = outs
      ? (((po + assists) * 27) / outs).toFixed(2)
      : null;
    return row;
  });
}

export const playerCols = (group: StatGroup): TeamStatCol[] =>
  group === "hitting"
    ? PLAYER_HITTING_COLS
    : group === "pitching"
      ? PLAYER_PITCHING_COLS
      : PLAYER_FIELDING_COLS;

/**
 * Every player on a club's season, one row each — the stats tab's tables and
 * the source the home tab's leader boards are ranked from.
 *
 * `playerPool=ALL` is what makes it every player: the default pool is the
 * qualified one, which on a club with an injured rotation answers with a
 * single pitcher. Qualification is a property of a leader board, not of the
 * roster, so it is applied where the boards are built instead.
 */
export async function getTeamPlayerStats(
  id: number,
  season: number,
  group: StatGroup,
  gameType: PlayerGameType = "R",
): Promise<PlayerStatRow[]> {
  const data = await mlb(
    `/stats?stats=season&group=${group}&season=${season}&teamId=${id}` +
      `&gameType=${gameType}&sportId=1&playerPool=ALL&limit=200&hydrate=person`,
    1800,
  );
  const columns = playerCols(group);
  const rows = ((data.stats?.[0]?.splits ?? []) as any[]).map(
    (s): PlayerStatRow => {
      const stat = s.stat ?? {};
      /* A player who hasn't taken the field yet (a pinch hitter, a September
         call-up) is filed under "X", Unknown — his listed position says more. */
      const pos = s.position?.abbreviation;
      return {
        id: s.player?.id,
        name: s.player?.fullName ?? "—",
        position:
          pos && pos !== "X"
            ? pos
            : (s.player?.primaryPosition?.abbreviation ?? pos ?? ""),
        values: Object.fromEntries(
          columns.map((c) => [c.key, stat[c.key] ?? null]),
        ),
      };
    },
  );
  if (group === "fielding") return mergeFielding(rows);
  /* Every arm arrives as "P"; the pitching table names his job instead, read
     the same way the roster splits rotation from bullpen. */
  if (group === "pitching")
    return rows.map((r) => ({
      ...r,
      position: inRotation(
        teamStatNum(r.values.gamesStarted) ?? 0,
        teamStatNum(r.values.gamesPlayed) ?? 0,
      )
        ? "SP"
        : "RP",
    }));
  /* `playerPool=ALL` answers with every pitcher who ever appeared, each with an
     empty batting line. A pitcher belongs on a hitting table only if he
     actually hit — a pinch-hit appearance in a blowout counts, a row of zeros
     does not. */
  return group === "hitting"
    ? rows.filter(
        (r) =>
          r.position !== "P" ||
          (teamStatNum(r.values.plateAppearances) ?? 0) > 0,
      )
    : rows;
}
