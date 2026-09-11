import { mlb, getSchedule, type TeamStatCol } from "@/lib/mlb";

/*
 * One day of baseball as it was actually played: who had the best game with
 * the bat and on the mound, and the four tracked figures that only exist
 * pitch by pitch — how hard a ball was hit, how far it carried, how hard a
 * pitch arrived, and who missed bats.
 *
 * The two day lines come from a single `byDateRange` read each, which is the
 * whole league's day in one request. The tracked figures have no season or
 * date endpoint at all — they live in the play log — so those are read one
 * game at a time and folded together here. A game the log can't be had for
 * drops out rather than taking the tab down with it.
 */

/** A player's day, ranked. `cells` is in the order of the group's columns. */
export interface DayLine {
  personId: number;
  name: string;
  teamId: number;
  cells: (string | number)[];
}

/** One line of a tracked board — a player, their best of the day, and what
 *  produced it (the pitch thrown, or what the batted ball went for). */
export interface FeedRow {
  personId: number;
  name: string;
  value: string;
  detail: string;
}

export interface FeedBoard {
  code: string;
  label: string;
  rows: FeedRow[];
}

export interface GameFeed {
  hitters: DayLine[];
  pitchers: DayLine[];
  boards: FeedBoard[];
  /** Games whose play log was read — zero means nothing has been played yet. */
  games: number;
}

/* The day line columns. The leading figure of each is the one the table is
   ordered by, so it is a column like any other rather than a hidden key. */
export const DAY_HITTING_COLS: TeamStatCol[] = [
  { key: "pts", label: "PTS", title: "Day score: TB + RBI + R + BB + SB" },
  { key: "atBats", label: "AB", title: "At-bats" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "runs", label: "R", title: "Runs scored" },
  { key: "doubles", label: "2B", title: "Doubles" },
  { key: "triples", label: "3B", title: "Triples" },
  { key: "homeRuns", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Runs batted in" },
  { key: "baseOnBalls", label: "BB", title: "Walks" },
  { key: "strikeOuts", label: "SO", title: "Strikeouts" },
  { key: "stolenBases", label: "SB", title: "Stolen bases" },
];

export const DAY_PITCHING_COLS: TeamStatCol[] = [
  {
    key: "gsc",
    label: "GSC",
    title:
      "Game Score (Tango): 40 + 2×outs + SO − 2×BB − 2×H − 3×R − 6×HR",
  },
  { key: "inningsPitched", label: "IP", title: "Innings pitched" },
  { key: "hits", label: "H", title: "Hits allowed" },
  { key: "runs", label: "R", title: "Runs allowed" },
  { key: "earnedRuns", label: "ER", title: "Earned runs allowed" },
  { key: "homeRuns", label: "HR", title: "Home runs allowed" },
  { key: "baseOnBalls", label: "BB", title: "Walks allowed" },
  { key: "strikeOuts", label: "SO", title: "Strikeouts" },
  { key: "numberOfPitches", label: "PC", title: "Pitch count" },
];

const n = (v: unknown): number => (typeof v === "number" ? v : 0);

/** A hitter's day in one figure — total bases plus what else he put on the
 *  board. Not an official stat; it is only the table's order, spelled out in
 *  the column's own tooltip rather than left as a mystery sort. */
export const hitterPoints = (s: any) =>
  n(s.totalBases) + n(s.rbi) + n(s.runs) + n(s.baseOnBalls) + n(s.stolenBases);

/** Tango's Game Score v2 — the one figure that reads a start and a relief
 *  outing on the same scale, which is what a mixed day board needs. */
export const gameScore = (s: any) =>
  40 +
  2 * n(s.outsPitched) +
  n(s.strikeOuts) -
  2 * n(s.baseOnBalls) -
  2 * n(s.hits) -
  3 * n(s.runs) -
  6 * n(s.homeRuns);

/** The whole league's day in one group, ordered by `rank` and cut to `top`. */
async function dayLines(
  date: string,
  group: "hitting" | "pitching",
  columns: TeamStatCol[],
  rank: (stat: any) => number,
  top: number,
): Promise<DayLine[]> {
  const data = await mlb(
    `/stats?stats=byDateRange&startDate=${date}&endDate=${date}` +
      `&group=${group}&sportId=1&limit=1000`,
    60,
  ).catch(() => null);

  return ((data?.stats?.[0]?.splits ?? []) as any[])
    .flatMap((s) => {
      const id = s.player?.id;
      /* A pitcher shows up in the hitting feed for a day he never batted, and
         a position player in the pitching one for a blowout inning he faced
         nobody in — neither is a line worth ranking. */
      const played = group === "hitting" ? n(s.stat?.atBats) : n(s.stat?.battersFaced);
      if (!id || played === 0) return [];
      const lead = rank(s.stat ?? {});
      return [
        {
          personId: id,
          name: s.player?.fullName ?? "—",
          teamId: s.team?.id ?? 0,
          lead,
          cells: columns.map((c, i) =>
            i === 0 ? lead : (s.stat?.[c.key] ?? 0),
          ),
        },
      ];
    })
    .sort((a, b) => b.lead - a.lead)
    .slice(0, top)
    .map(({ lead: _lead, ...line }): DayLine => line);
}

/* The play log, trimmed to the tracked numbers and who they belong to. The
   untrimmed payload is a megabyte a game; this is around sixty kilobytes. */
const FEED_FIELDS =
  "allPlays,result,event,matchup,batter,pitcher,id,fullName,playEvents," +
  "details,description,type,code,call,isPitch,pitchData,startSpeed," +
  "hitData,launchSpeed,totalDistance";

/** A pitch the batter swung through — swinging strike, blocked, or tipped. */
const WHIFF_CODES = new Set(["S", "W", "T"]);

/** One tracked event, before it is ranked into a board. */
interface Mark {
  personId: number;
  name: string;
  value: number;
  detail: string;
}

/** The best mark per player, highest first, cut to five — so a board reads as
 *  five players rather than one pitcher's five fastest fastballs. */
function bestPerPlayer(marks: Mark[], format: (v: number) => string): FeedRow[] {
  const seen = new Set<number>();
  const rows: FeedRow[] = [];
  for (const m of marks.sort((a, b) => b.value - a.value)) {
    if (seen.has(m.personId)) continue;
    seen.add(m.personId);
    rows.push({
      personId: m.personId,
      name: m.name,
      value: format(m.value),
      detail: m.detail,
    });
    if (rows.length === 5) break;
  }
  return rows;
}

/**
 * The four tracked boards, folded out of a day's play logs.
 *
 * Pure, and separated from the fetch on purpose: this is the only real logic
 * on the tab — which pitch counts as a swing and miss, which player a mark
 * belongs to — and it is worth being able to check without a day of baseball.
 */
export function feedBoards(logs: unknown[]): FeedBoard[] {
  const exit: Mark[] = [];
  const distance: Mark[] = [];
  const velo: Mark[] = [];
  /* Whiffs are a count rather than a best-of, so they accumulate by pitcher. */
  const whiffs = new Map<number, Mark>();

  for (const log of logs as any[]) {
    for (const play of (log?.allPlays ?? []) as any[]) {
      const batter = play.matchup?.batter;
      /* ponytail: the at-bat's pitcher of record, so a mid-at-bat change
         credits the whole plate appearance to whoever finished it. Walk the
         playEvents for the substitution if a whiff count ever has to be
         exact — it moves a pitch or two a day, none of it a board-topper. */
      const pitcher = play.matchup?.pitcher;
      const event = play.result?.event ?? "";
      for (const e of (play.playEvents ?? []) as any[]) {
        if (!e.isPitch) continue;

        const speed = e.pitchData?.startSpeed;
        if (pitcher?.id && typeof speed === "number") {
          velo.push({
            personId: pitcher.id,
            name: pitcher.fullName ?? "—",
            value: speed,
            detail: e.details?.type?.description ?? "",
          });
        }

        if (pitcher?.id && WHIFF_CODES.has(e.details?.call?.code ?? "")) {
          const at = whiffs.get(pitcher.id) ?? {
            personId: pitcher.id,
            name: pitcher.fullName ?? "—",
            value: 0,
            detail: "",
          };
          at.value += 1;
          whiffs.set(pitcher.id, at);
        }

        const hit = e.hitData;
        if (!batter?.id || !hit) continue;
        const who = { personId: batter.id, name: batter.fullName ?? "—" };
        if (typeof hit.launchSpeed === "number")
          exit.push({ ...who, value: hit.launchSpeed, detail: event });
        if (typeof hit.totalDistance === "number")
          distance.push({ ...who, value: hit.totalDistance, detail: event });
      }
    }
  }

  return [
    {
      code: "exit",
      label: "TOP EXIT VELOCITY",
      rows: bestPerPlayer(exit, (v) => `${v.toFixed(1)} MPH`),
    },
    {
      code: "distance",
      label: "LONGEST BATTED BALL",
      rows: bestPerPlayer(distance, (v) => `${Math.round(v)} FT`),
    },
    {
      code: "velo",
      label: "TOP PITCH VELOCITY",
      rows: bestPerPlayer(velo, (v) => `${v.toFixed(1)} MPH`),
    },
    {
      code: "whiffs",
      label: "SWINGS AND MISSES",
      rows: bestPerPlayer([...whiffs.values()], (v) => String(v)),
    },
  ];
}

export async function getGameFeed(date: string): Promise<GameFeed> {
  const games = await getSchedule(date);
  /* A game that hasn't started has no play log to ask for. */
  const started = games.filter((g) => g.state !== "Preview");

  const [logs, hitters, pitchers] = await Promise.all([
    Promise.all(
      started.map((g) =>
        mlb(`/game/${g.pk}/playByPlay?fields=${FEED_FIELDS}`, 60).catch(
          () => null,
        ),
      ),
    ),
    dayLines(date, "hitting", DAY_HITTING_COLS, hitterPoints, 10),
    dayLines(date, "pitching", DAY_PITCHING_COLS, gameScore, 10),
  ]);

  return {
    games: logs.filter(Boolean).length,
    hitters,
    pitchers,
    boards: feedBoards(logs),
  };
}
