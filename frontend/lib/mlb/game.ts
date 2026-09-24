/* A single game beyond its box score: pre-game, the matchup, the live feed, hot and cold zones. */
import { unstable_cache } from "next/cache";
import {
  FETCH_TIMEOUT_MS,
  mlb,
} from "./core";
import {
  type TeamStatCol,
  type TeamStatValue,
} from "./stats";
import {
  type Game,
  type GameSide,
} from "./schedule";
import {
  type PlayerStatRow,
} from "./players";


/* ── Pre-game ───────────────────────────────────────────────────────── */

/**
 * True until the first pitch — what the game page hangs its pre-game view off.
 * The abstract state alone won't do it: warmup reports as Live, having already
 * been handed a Top 1 linescore.
 */
export const notStarted = (g: Game): boolean =>
  g.state === "Preview" || g.detailedState === "Warmup";

/** One spot in a posted lineup, in batting order. */
export interface LineupSpot {
  id: number;
  name: string;
  pos: string;
}

/**
 * Everything about a game that only matters before it starts, off one
 * schedule read: the posted lineups, who is umpiring, what the weather is
 * doing, who is carrying it, and where the game sits in its series.
 */
export interface Pregame {
  weather: { condition: string; temp: string; wind: string } | null;
  /** Call signs, TV ahead of radio; MLB lists the same station once per club. */
  broadcasts: { type: string; name: string }[];
  officials: { role: string; name: string }[];
  /** Empty until the club posts the card, a couple of hours out. */
  away: LineupSpot[];
  home: LineupSpot[];
  /** "NYM leads 1-0" — MLB's own wording, once the series has a result. */
  series: { game: number; total: number; result: string } | null;
}

const PREGAME_HYDRATE =
  "weather,officials,broadcasts(all),lineups,seriesStatus";

const spot = (p: any): LineupSpot => ({
  id: p.id,
  name: p.fullName ?? "—",
  pos: p.primaryPosition?.abbreviation ?? "",
});

export async function getPregame(pk: number): Promise<Pregame | null> {
  const data = await mlb(
    `/schedule?sportId=1&gamePk=${pk}&hydrate=${PREGAME_HYDRATE}`,
    300,
  );
  const g = data.dates?.[0]?.games?.[0];
  if (!g) return null;

  const seen = new Set<string>();
  const w = g.weather;
  return {
    weather: w?.condition
      ? { condition: w.condition, temp: w.temp ?? "", wind: w.wind ?? "" }
      : null,
    broadcasts: ((g.broadcasts ?? []) as any[])
      .filter((b) => b.name && !seen.has(b.name) && seen.add(b.name))
      .sort((a, b) => Number(b.type === "TV") - Number(a.type === "TV"))
      .map((b) => ({ type: b.type ?? "", name: b.name })),
    officials: ((g.officials ?? []) as any[]).map((o) => ({
      role: o.officialType ?? "",
      name: o.official?.fullName ?? "—",
    })),
    away: ((g.lineups?.awayPlayers ?? []) as any[]).map(spot),
    home: ((g.lineups?.homePlayers ?? []) as any[]).map(spot),
    series: g.seriesStatus
      ? {
          game: g.seriesStatus.gameNumber ?? 0,
          total: g.seriesStatus.totalGames ?? 0,
          result: g.seriesStatus.result ?? "",
        }
      : null,
  };
}

/* ── The matchup ────────────────────────────────────────────────────── */

/**
 * The columns a lineup card shows, and the ones a career-against line and a
 * season line both carry — so the card's two modes fill the same table.
 */
export const LINEUP_COLS: TeamStatCol[] = [
  { key: "hAb", label: "H-AB", title: "Hits and at-bats" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "baseOnBalls", label: "BB", title: "Walks (bases on balls)" },
  { key: "strikeOuts", label: "K", title: "Strikeouts" },
  { key: "avg", label: "AVG", title: "Batting average — hits per at-bat" },
  { key: "obp", label: "OBP", title: "On-base percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
];

/** A hitter's line as the card reads it, or null where there is no line. */
export type LineupLine = Record<string, TeamStatValue> | null;

/* Hits and at-bats read as one cell on a matchup line — "3-11", not two
   columns a reader has to divide themselves. */
const lineupLine = (stat: any): LineupLine =>
  stat
    ? {
        ...Object.fromEntries(
          LINEUP_COLS.map((c) => [c.key, stat[c.key] ?? null]),
        ),
        hAb: `${stat.hits ?? 0}-${stat.atBats ?? 0}`,
      }
    : null;

/**
 * Every listed hitter's career line against today's opposing starter.
 *
 * MLB answers this one batter at a time — there is no bulk form — so it is a
 * request per spot in the order, fired together. A career total against one
 * pitcher only moves when they next meet, so it caches for a day, and a
 * batter who has never faced him comes back as null rather than a row of
 * zeros.
 */
export async function getVsPitcher(
  batters: number[],
  pitcherId: number,
): Promise<Record<number, LineupLine>> {
  const lines = await Promise.all(
    batters.map((id) =>
      mlb(
        `/people/${id}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${pitcherId}`,
        86400,
      )
        .then((d) => {
          const splits = (d.stats?.[0]?.splits ?? []) as any[];
          const s = splits.find((x) => x.gameType === "R") ?? splits[0];
          return lineupLine(s?.stat);
        })
        .catch(() => null),
    ),
  );
  return Object.fromEntries(batters.map((id, i) => [id, lines[i]]));
}

/*
 * No pitcher on a major-league roster debuted before this, so a whole career
 * is one call away without first asking which seasons it covers.
 */
const FIRST_ACTIVE_SEASON = 1995;

/* Only the counts a pitching line is added up from — a career of game logs is
   a large payload to carry the six numbers a matchup card prints. */
const LOG_FIELDS = [
  "stats,splits,season,gameType,opponent,id,stat",
  "gamesPlayed,inningsPitched,earnedRuns,wins,losses",
  "strikeOuts,baseOnBalls,battersFaced,hits,atBats",
].join(",");

/** One appearance, as a line waiting to be added into a total. */
export interface ArmGame {
  season: number;
  opponentId: number;
  stat: Record<string, TeamStatValue>;
}

/**
 * Every regular-season appearance of a pitcher's career, game by game.
 *
 * MLB's vs-team total is a hitting line — what the other club did off him —
 * so it carries no ERA and no record. The game log is the only feed that
 * does, and it answers a whole career in one request, which both a season
 * line and a line against one club are then summed out of.
 */
export async function getPitcherLog(
  id: number,
  through: number,
): Promise<ArmGame[]> {
  const seasons = Array.from(
    { length: through - FIRST_ACTIVE_SEASON + 1 },
    (_, i) => FIRST_ACTIVE_SEASON + i,
  ).join(",");
  const data = await mlb(
    `/people/${id}/stats?stats=gameLog&group=pitching&seasons=${seasons}` +
      `&fields=${LOG_FIELDS}`,
    3600,
  ).catch(() => null);
  return ((data?.stats?.[0]?.splits ?? []) as any[])
    .filter((s) => s.gameType === "R")
    .map((s) => ({
      season: Number(s.season),
      opponentId: s.opponent?.id ?? 0,
      stat: s.stat ?? {},
    }));
}

/** A starter's number and throwing hand, the two facts a card names him by. */
export interface ArmIdentity {
  number: string;
  throws: string;
}

/** Those two facts for a whole slate's starters, in one request. */
export async function getArmIdentities(
  ids: number[],
): Promise<Record<number, ArmIdentity>> {
  if (ids.length === 0) return {};
  const data = await mlb(
    `/people?personIds=${ids.join(",")}` +
      `&fields=people,id,primaryNumber,pitchHand,code`,
    86400,
  ).catch(() => null);
  return Object.fromEntries(
    ((data?.people ?? []) as any[]).map((p) => [
      p.id,
      { number: p.primaryNumber ?? "", throws: p.pitchHand?.code ?? "" },
    ]),
  );
}

/**
 * A cell shaded by how far a figure sits from the league's, at the saturation
 * the swing deserves: red for a positive swing, blue for a negative one, and
 * `max` the swing that earns full colour.
 *
 * Which side is which is the caller's to decide — it hands over a signed
 * distance, so a column where the low end is the good end flips the sign
 * rather than inventing a second palette. Shading goes on the cell itself: a
 * padded span inside it would sit a hairline short of the row's edges.
 */
export function heat(
  value: number,
  max: number,
): { backgroundColor: string } | undefined {
  if (!value || !max) return undefined;
  const alpha = (Math.min(Math.abs(value) / max, 1) * 0.55).toFixed(2);
  const rgb = value > 0 ? "198, 45, 45" : "38, 104, 201";
  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

/** A club's season line for each of its hitters, keyed by player id. */
export const lineupSeason = (
  rows: PlayerStatRow[],
): Record<number, LineupLine> =>
  Object.fromEntries(rows.map((r) => [r.id, lineupLine(r.values)]));

/*
 * Home field is worth about .535 across a season — the odds multiplier that
 * shifts an even matchup to that number.
 */
const HOME_FIELD_ODDS = 0.535 / 0.465;

/**
 * Pre-game win probability, from the two clubs' records alone: log5, the
 * standard way to turn two winning percentages into a head-to-head number,
 * tilted for home field. Null before either club has played.
 *
 * ponytail: records and home field only — no starters, no bullpen, no park.
 * A starter-aware number would need projections this API doesn't publish;
 * blend one in here if it ever does.
 */
export function winProbability(g: Game): { home: number; away: number } | null {
  const pct = (s: GameSide) => {
    const played = (s.wins ?? 0) + (s.losses ?? 0);
    return s.wins === null || played === 0 ? null : s.wins / played;
  };
  const h = pct(g.home);
  const a = pct(g.away);
  if (h === null || a === null) return null;

  const denom = h + a - 2 * h * a;
  /* Two unbeaten clubs, or two winless ones, log5 cannot separate. */
  const base =
    denom === 0 ? 0.5 : Math.min(0.99, Math.max(0.01, (h - h * a) / denom));
  const odds = (base / (1 - base)) * HOME_FIELD_ODDS;
  const home = odds / (1 + odds);
  return { home, away: 1 - home };
}

/** The games two clubs play each other, out of one of their schedules — the
 *  season series for free, since that schedule is already cached. */
export const headToHead = (schedule: Game[], oppId: number): Game[] =>
  schedule
    .filter((g) => g.away.id === oppId || g.home.id === oppId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

/*
 * Clubs play a series on consecutive days, so a gap of more than a day and a
 * half is where one series ends and the next begins. A doubleheader's two
 * games sit hours apart and stay together.
 *
 * ponytail: date proximity rather than a series id — MLB publishes the game's
 * number in its series but not which other games share it. A series split
 * around an off-day would read as two; use seriesGameNumber to stitch it if
 * that ever comes up.
 */
const SERIES_GAP_MS = 36 * 3600 * 1000;

export function seriesGames(matchups: Game[], pk: number): Game[] {
  const i = matchups.findIndex((g) => g.pk === pk);
  if (i < 0) return [];
  const at = (n: number) => new Date(matchups[n].startTime).getTime();
  let lo = i;
  let hi = i;
  while (lo > 0 && at(lo) - at(lo - 1) <= SERIES_GAP_MS) lo--;
  while (hi < matchups.length - 1 && at(hi + 1) - at(hi) <= SERIES_GAP_MS) hi++;
  return matchups.slice(lo, hi + 1);
}

/* ── Live game ──────────────────────────────────────────────────────── */

/** A game with a pitch actually being thrown — warmup is Live but isn't this. */
export const inProgress = (g: Game): boolean =>
  g.state === "Live" && !notStarted(g);

/** One pitch of the at-bat under way. */
export interface LivePitch {
  /** Its number in this at-bat — what the mark on the zone plot is labelled. */
  number: number;
  /** "FF", the code the pitch colours are keyed on. */
  code: string;
  name: string;
  /** "Strike Swinging", "Ball", "In play, run(s)". */
  call: string;
  speed: number | null;
  /** Feet from the middle of the plate and off the ground, catcher's view. */
  x: number | null;
  z: number | null;
  outcome: "ball" | "strike" | "in-play";
}

export interface AtBat {
  pitcher: { id: number; name: string } | null;
  /** "R" / "L". */
  hand: string;
  batter: { id: number; name: string } | null;
  side: string;
  balls: number;
  strikes: number;
  outs: number;
  pitches: LivePitch[];
  /** This batter's zone in feet — the box the marks are read against. */
  zoneTop: number;
  zoneBottom: number;
}

/** One completed at-bat: what happened, the score after it, and what it did
 *  to the home club's chances. */
export interface PlayProb {
  inning: number;
  /** "top" or "bottom". */
  half: string;
  description: string;
  /** MLB's own name for what happened — "strikeout", "home_run", "single". */
  event: string;
  /** Who threw the at-bat, for the marks that belong to a pitcher. */
  pitcher: { id: number; name: string } | null;
  /** Pitches thrown in the at-bat; the timeouts and substitutions the log
   *  carries alongside them don't count. */
  pitches: number;
  awayScore: number;
  homeScore: number;
  /** The home club's chance after the play, 0–100. */
  homeProb: number;
  /** How far a home run carried, in feet — null on every other play. */
  distance: number | null;
  /** How many of the 30 parks the ball would have left, off Statcast — a
   *  double off the wall has one too. Null for a play with none, and until
   *  Savant has measured it. */
  parks: number | null;
}

export interface LiveGame {
  atBat: AtBat | null;
  onDeck: { id: number; name: string } | null;
  /** Who is standing on first, second and third — null for an empty bag. */
  bases: ({ id: number; name: string } | null)[];
  plays: PlayProb[];
}

/* The rulebook zone, for the rare pitch that arrives without the batter's own. */
const ZONE_TOP = 3.4;
const ZONE_BOTTOM = 1.6;

/* One at-bat's worth of pitches, and the play log the win-probability chart is
   drawn from. `fields` trims both hard: the untrimmed payloads carry a hot-cold
   zone breakdown per play and run to hundreds of kilobytes. */
const PLAY_FIELDS =
  "currentPlay,result,about,inning,halfInning,count,balls,strikes,outs,matchup," +
  "batter,pitcher,id,fullName,batSide,pitchHand,code,description,playEvents," +
  "details,call,type,isStrike,isBall,isInPlay,isPitch,pitchNumber,pitchData," +
  "startSpeed,strikeZoneTop,strikeZoneBottom,coordinates,pX,pZ";

const PROB_FIELDS =
  "about,inning,halfInning,result,description,awayScore,homeScore," +
  "homeTeamWinProbability,eventType,matchup,pitcher,id,fullName,atBatIndex," +
  "playEvents,isPitch,hitData,totalDistance";

const livePerson = (p: any) =>
  p?.id ? { id: p.id, name: p.fullName ?? "—" } : null;

function livePitch(e: any): LivePitch {
  const d = e.details ?? {};
  const c = e.pitchData?.coordinates ?? {};
  return {
    number: e.pitchNumber ?? 0,
    code: d.type?.code ?? "",
    name: d.type?.description ?? "—",
    call: d.description ?? d.call?.description ?? "—",
    speed:
      typeof e.pitchData?.startSpeed === "number"
        ? e.pitchData.startSpeed
        : null,
    x: typeof c.pX === "number" ? c.pX : null,
    z: typeof c.pZ === "number" ? c.pZ : null,
    outcome: d.isInPlay ? "in-play" : d.isStrike ? "strike" : "ball",
  };
}

/**
 * How many parks each of a game's batted balls would have cleared, by at-bat
 * index — only the ones that would have cleared any. MLB's own feeds don't
 * carry it; Savant's game feed does, but runs to megabytes — past what the
 * fetch cache will hold — so that fetch goes uncached and it is these few
 * numbers that get cached instead. The play count is in the key so a new
 * at-bat is looked up straight away.
 */
const homeRunParks = unstable_cache(
  async (pk: number, _plays: number): Promise<Record<number, number>> => {
    const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${pk}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Savant ${res.status}: gf ${pk}`);
    const gf = await res.json();
    const parks: Record<number, number> = {};
    for (const p of [...(gf.team_home ?? []), ...(gf.team_away ?? [])] as any[])
      if (p.contextMetrics?.homeRunBallparks > 0)
        /* Savant counts at-bats from one, MLB from zero. */
        parks[p.ab_number - 1] = p.contextMetrics.homeRunBallparks;
    return parks;
  },
  ["savant-hr-parks"],
  /* Savant's own edge holds the feed ten minutes; a home run it hadn't
     measured yet at the last look gets another within five. */
  { revalidate: 300 },
);

/**
 * The state of a game being played: the at-bat under way pitch by pitch, who
 * is on base and on deck, and every at-bat so far with what it did to the
 * home club's chances.
 *
 * Three small requests rather than the live feed, which is one request but a
 * quarter of a megabyte and climbing. Short revalidate — this is the part of
 * the page that has to keep up with the game.
 */
export async function getLive(pk: number): Promise<LiveGame> {
  const [play, line, prob] = await Promise.all([
    mlb(`/game/${pk}/playByPlay?fields=${PLAY_FIELDS}`, 15),
    mlb(`/game/${pk}/linescore`, 15),
    /* Win probability is the one MLB can be missing on a young game. */
    mlb(`/game/${pk}/winProbability?fields=${PROB_FIELDS}`, 15).catch(() => []),
  ]);

  const played = ((prob ?? []) as any[]).length;
  const parks = played
    ? await homeRunParks(pk, played).catch(() => ({}) as Record<number, number>)
    : {};

  const cur = play.currentPlay;
  const thrown = ((cur?.playEvents ?? []) as any[]).filter((e) => e.isPitch);
  /* Every pitch carries the zone as measured for this batter; the last one
     measured is the one the plot is drawn to. */
  const zone = thrown.at(-1)?.pitchData ?? {};
  const offense = line.offense ?? {};
  const defense = line.defense ?? {};
  /*
   * The line score is what is happening now; the play log keeps the at-bat
   * that just ended as its current one until the next batter steps in. So the
   * matchup is read off the line score — otherwise the panel pairs a batter
   * with the on-deck hitter from the other club between innings — and the
   * pitch sequence is shown only while the two agree on whose at-bat it is.
   */
  const batter = offense.batter ?? cur?.matchup?.batter;
  const current = !!batter && cur?.matchup?.batter?.id === batter.id;

  return {
    atBat: batter
      ? {
          pitcher: livePerson(defense.pitcher ?? cur?.matchup?.pitcher),
          hand: current ? (cur.matchup?.pitchHand?.code ?? "") : "",
          batter: livePerson(batter),
          side: current ? (cur.matchup?.batSide?.code ?? "") : "",
          balls: line.balls ?? 0,
          strikes: line.strikes ?? 0,
          outs: line.outs ?? 0,
          pitches: current ? thrown.map(livePitch) : [],
          zoneTop: zone.strikeZoneTop ?? ZONE_TOP,
          zoneBottom: zone.strikeZoneBottom ?? ZONE_BOTTOM,
        }
      : null,
    onDeck: livePerson(offense.onDeck),
    bases: [offense.first, offense.second, offense.third].map(livePerson),
    plays: ((prob ?? []) as any[]).map(
      (p): PlayProb => ({
        inning: p.about?.inning ?? 0,
        half: p.about?.halfInning ?? "",
        description: p.result?.description ?? "",
        event: p.result?.eventType ?? "",
        pitcher: livePerson(p.matchup?.pitcher),
        pitches: ((p.playEvents ?? []) as any[]).filter((e) => e.isPitch)
          .length,
        awayScore: p.result?.awayScore ?? 0,
        homeScore: p.result?.homeScore ?? 0,
        homeProb: p.homeTeamWinProbability ?? 50,
        /* Only the ball that left the park gets its flight reported — every
           other batted ball has a distance too, and none of it is news. */
        distance:
          p.result?.eventType === "home_run"
            ? (((p.playEvents ?? []) as any[])
                .map((e) => e.hitData?.totalDistance)
                .find((d) => typeof d === "number") ?? null)
            : null,
        parks: parks[p.about?.atBatIndex] ?? null,
      }),
    ),
  };
}

/* ── Hot and cold zones ─────────────────────────────────────────────── */

/** One cell of the batter's season, as MLB grades it. Zones "01"–"09" are the
 *  strike zone read left to right and top to bottom, "11"–"14" the four
 *  quadrants outside it. */
export interface HeatZone {
  zone: string;
  /** The average itself, ".312". */
  value: string;
  /** MLB's own grading: cold, cool, lukewarm, warm, hot. */
  temp: string;
}

/**
 * How a hitter has done by part of the zone this season — the shading behind
 * the live pitch plot.
 *
 * MLB grades every cell itself against the rest of the league, so the plot
 * takes its temperature rather than inventing a scale off thirteen numbers.
 * A hitter with too few swings comes back empty and the plot simply has no
 * shading; season-to-date figures move once a day, so this is cached for one
 * hour rather than on the live game's beat.
 */
export async function getHotZones(id: number): Promise<HeatZone[]> {
  const data = await mlb(
    `/people/${id}/stats?stats=hotColdZones&group=hitting&fields=stats,splits,stat,name,zones,zone,value,temp`,
    3600,
  ).catch(() => null);
  const splits = data?.stats?.[0]?.splits ?? [];
  const avg = (splits as any[]).find((s) => s.stat?.name === "battingAverage");
  return ((avg?.stat?.zones ?? []) as any[]).map(
    (z): HeatZone => ({ zone: z.zone, value: z.value, temp: z.temp }),
  );
}

/**
 * The plays that put a run on the board — read off the running score rather
 * than off MLB's own scoring-play list, which is a set of indexes into a
 * payload this page never asks for.
 */
export function scoringPlays(plays: PlayProb[]): PlayProb[] {
  return plays.filter((p, i) => {
    const before = plays[i - 1];
    return (
      p.awayScore !== (before?.awayScore ?? 0) ||
      p.homeScore !== (before?.homeScore ?? 0)
    );
  });
}

/**
 * What sets a ball hit for distance apart, when anything does: a home run
 * that never left the park, and — whatever became of the ball — one that was
 * a home run in only one park (a unicorn), in every park but one (a reverse
 * unicorn: a double off the wall here, most likely), or in every park.
 */
export function homerKind(p: PlayProb): string | null {
  if (p.event === "home_run" && /inside-the-park/i.test(p.description))
    return "Inside-the-park home run";
  if (p.parks === 1) return "Unicorn · HR in 1/30 parks";
  if (p.parks === 29) return "Reverse unicorn · HR in 29/30 parks";
  if (p.parks === 30) return "No-doubter · HR in 30/30 parks";
  return null;
}

/** One half-inning of the play log, in the order it was played. */
export interface HalfInning {
  inning: number;
  half: string;
  /** Runs that crossed in this half — the score's own movement, either club. */
  runs: number;
  plays: PlayProb[];
}

/**
 * The play log cut into half-innings, so a play-by-play reads the way a
 * scorecard does rather than as one flat list of four hundred at-bats.
 */
export function halfInnings(plays: PlayProb[]): HalfInning[] {
  const out: HalfInning[] = [];
  plays.forEach((p, i) => {
    let half = out.at(-1);
    if (!half || half.inning !== p.inning || half.half !== p.half) {
      half = { inning: p.inning, half: p.half, runs: 0, plays: [] };
      out.push(half);
    }
    const before = plays[i - 1];
    half.runs +=
      p.awayScore -
      (before?.awayScore ?? 0) +
      (p.homeScore - (before?.homeScore ?? 0));
    half.plays.push(p);
  });
  return out;
}

/**
 * The three strikeouts of an immaculate inning, each with the line to fly
 * over it.
 *
 * Nine pitches, nine strikes, three strikeouts, one pitcher — which is the
 * same thing as a half-inning of exactly three strikeouts that each took
 * exactly three pitches, since a three-pitch strikeout has no ball in it to
 * begin with. Read off the half-innings the log is already cut into, so a
 * pitching change mid-inning breaks it the way the rulebook does.
 */
export function immaculatePlays(plays: PlayProb[]): Map<PlayProb, string> {
  const out = new Map<PlayProb, string>();
  for (const half of halfInnings(plays)) {
    const who = half.plays[0]?.pitcher;
    if (
      !who ||
      half.plays.length !== 3 ||
      !half.plays.every(
        (p) =>
          p.event === "strikeout" &&
          p.pitches === 3 &&
          p.pitcher?.id === who.id,
      )
    )
      continue;
    for (const p of half.plays)
      out.set(
        p,
        `${who.name} · Three-pitch immaculate inning strikeout ${
          /* MLB writes the third strike three ways: taken, swung through, and
             tipped into the mitt — only the first of them is looking. */
          /called out on strikes/i.test(p.description) ? "looking" : "swinging"
        }`,
      );
  }
  return out;
}
