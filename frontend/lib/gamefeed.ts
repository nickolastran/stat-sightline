import { mlb, getSchedule } from "@/lib/mlb";

/*
 * One day of baseball as it was actually played — eight boards of five, each
 * the best of the day at one thing. Most of them exist only pitch by pitch
 * (how hard a ball was hit, how far it carried, how hard a pitch arrived,
 * who missed bats, who swung the game), so they are read one game at a time
 * out of the play log and the win probability line and folded together here.
 * Hits and strikeouts are plain box score counts, so those come from a
 * single whole-league read each.
 *
 * A game whose log can't be had drops out rather than taking the tab down.
 */

/** One line of a board — a player and his best of the day. */
export interface FeedRow {
  personId: number;
  name: string;
  value: string;
}

export interface FeedBoard {
  code: string;
  label: string;
  rows: FeedRow[];
}

export interface GameFeed {
  boards: FeedBoard[];
  /** Games whose play log was read — zero means nothing has been played yet. */
  games: number;
}

/* The play log, trimmed to the tracked numbers and who they belong to. The
   untrimmed payload is a megabyte a game; this is around sixty kilobytes. */
const FEED_FIELDS =
  "allPlays,matchup,batter,pitcher,id,fullName,playEvents," +
  "details,call,code,isPitch,pitchData,startSpeed," +
  "hitData,launchSpeed,totalDistance";

/* The win probability line is the same plays again with a megabyte of
   matchup padding; only who batted and what it moved is wanted. */
const WP_FIELDS =
  "about,isTopInning,matchup,batter,pitcher,id,fullName," +
  "homeTeamWinProbabilityAdded";

/** A pitch the batter swung through — swinging strike, blocked, or tipped. */
const WHIFF_CODES = new Set(["S", "W", "T"]);

/** One tracked mark, before it is ranked into a board. */
interface Mark {
  personId: number;
  name: string;
  value: number;
}

/** The best mark per player, highest first, cut to five — so a board reads as
 *  five players rather than one pitcher's five fastest fastballs. */
function bestPerPlayer(marks: Mark[], format: (v: number) => string): FeedRow[] {
  const seen = new Set<number>();
  const rows: FeedRow[] = [];
  for (const m of [...marks].sort((a, b) => b.value - a.value)) {
    if (seen.has(m.personId)) continue;
    seen.add(m.personId);
    rows.push({ personId: m.personId, name: m.name, value: format(m.value) });
    if (rows.length === 5) break;
  }
  return rows;
}

/** A player's running total — for the boards that count rather than rank. */
function add(at: Map<number, Mark>, id: number, name: string, by: number) {
  const m = at.get(id) ?? { personId: id, name, value: 0 };
  m.value += by;
  at.set(id, m);
}

/**
 * The six tracked boards, folded out of a day's play logs and win
 * probability lines.
 *
 * Pure, and separated from the fetch on purpose: this is the only real logic
 * on the tab — which pitch counts as a swing and miss, which side of a win
 * probability swing the batter is on — and it is worth being able to check
 * without a day of baseball.
 */
export function feedBoards(logs: unknown[], wpLogs: unknown[]): FeedBoard[] {
  const exit: Mark[] = [];
  const distance: Mark[] = [];
  const velo: Mark[] = [];
  /* Whiffs are a count and win probability a sum, so all three accumulate. */
  const whiffs = new Map<number, Mark>();
  const wpa = new Map<number, Mark>();
  const pwpa = new Map<number, Mark>();

  for (const log of logs as any[]) {
    for (const play of (log?.allPlays ?? []) as any[]) {
      const batter = play.matchup?.batter;
      /* ponytail: the at-bat's pitcher of record, so a mid-at-bat change
         credits the whole plate appearance to whoever finished it. Walk the
         playEvents for the substitution if a whiff count ever has to be
         exact — it moves a pitch or two a day, none of it a board-topper. */
      const pitcher = play.matchup?.pitcher;
      for (const e of (play.playEvents ?? []) as any[]) {
        if (!e.isPitch) continue;

        const speed = e.pitchData?.startSpeed;
        if (pitcher?.id && typeof speed === "number")
          velo.push({
            personId: pitcher.id,
            name: pitcher.fullName ?? "—",
            value: speed,
          });

        if (pitcher?.id && WHIFF_CODES.has(e.details?.call?.code ?? ""))
          add(whiffs, pitcher.id, pitcher.fullName ?? "—", 1);

        const hit = e.hitData;
        if (!batter?.id || !hit) continue;
        const who = { personId: batter.id, name: batter.fullName ?? "—" };
        if (typeof hit.launchSpeed === "number")
          exit.push({ ...who, value: hit.launchSpeed });
        if (typeof hit.totalDistance === "number")
          distance.push({ ...who, value: hit.totalDistance });
      }
    }
  }

  /* The API states every swing from the home club's side, in whole percent.
     The batter owns it when he bats for the home club, and owns its opposite
     when he bats in the top half — and a win is one, not a hundred. The
     pitcher is on the other side of the same swing, so it is his negated:
     the man who gets the out gains exactly what the batter lost. */
  for (const plays of wpLogs as any[]) {
    for (const p of (plays ?? []) as any[]) {
      const swing = p.homeTeamWinProbabilityAdded;
      if (typeof swing !== "number") continue;
      const batting = (p.about?.isTopInning ? -swing : swing) / 100;
      const batter = p.matchup?.batter;
      const pitcher = p.matchup?.pitcher;
      if (batter?.id) add(wpa, batter.id, batter.fullName ?? "—", batting);
      if (pitcher?.id) add(pwpa, pitcher.id, pitcher.fullName ?? "—", -batting);
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
      rows: bestPerPlayer([...whiffs.values()], String),
    },
    {
      code: "wpa",
      label: "BATTER WPA",
      rows: bestPerPlayer([...wpa.values()], (v) => v.toFixed(3)),
    },
    {
      code: "pwpa",
      label: "PITCHER WPA",
      rows: bestPerPlayer([...pwpa.values()], (v) => v.toFixed(3)),
    },
  ];
}

/** A whole-league day of one box score figure, ranked. */
export function statBoard(
  splits: unknown[],
  key: string,
  code: string,
  label: string,
): FeedBoard {
  const marks = (splits as any[]).flatMap((s) => {
    const id = s.player?.id;
    const v = s.stat?.[key];
    return id && typeof v === "number" && v > 0
      ? [{ personId: id, name: s.player?.fullName ?? "—", value: v }]
      : [];
  });
  return { code, label, rows: bestPerPlayer(marks, String) };
}

/** The whole league's day in one group — one read, whatever is asked of it. */
async function dayStats(
  date: string,
  group: "hitting" | "pitching",
): Promise<unknown[]> {
  const data = await mlb(
    `/stats?stats=byDateRange&startDate=${date}&endDate=${date}` +
      `&group=${group}&sportId=1&limit=1000`,
    60,
  ).catch(() => null);
  return data?.stats?.[0]?.splits ?? [];
}

export async function getGameFeed(date: string): Promise<GameFeed> {
  const games = await getSchedule(date);
  /* A game that hasn't started has no play log to ask for. */
  const started = games.filter((g) => g.state !== "Preview");
  const orNull = (p: Promise<any>) => p.catch(() => null);

  const [logs, wpLogs, hitting, pitching] = await Promise.all([
    Promise.all(
      started.map((g) =>
        orNull(mlb(`/game/${g.pk}/playByPlay?fields=${FEED_FIELDS}`, 60)),
      ),
    ),
    Promise.all(
      started.map((g) =>
        orNull(mlb(`/game/${g.pk}/winProbability?fields=${WP_FIELDS}`, 60)),
      ),
    ),
    dayStats(date, "hitting"),
    dayStats(date, "pitching"),
  ]);

  const [exit, distance, velo, whiffs, wpa, pwpa] = feedBoards(logs, wpLogs);

  return {
    games: logs.filter(Boolean).length,
    /* The tracked figures first, then the day's counting numbers, then the
       two sides of the same win probability swing, side by side. */
    boards: [
      exit,
      distance,
      velo,
      whiffs,
      statBoard(hitting, "hits", "hits", "MOST HITS"),
      statBoard(pitching, "strikeOuts", "strikeouts", "MOST STRIKEOUTS"),
      wpa,
      pwpa,
    ],
  };
}
