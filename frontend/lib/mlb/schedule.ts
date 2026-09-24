/* The day's games: schedule rows, scoreboard, and the status of each. */
import {
  mlb,
} from "./core";


/* ── Schedule / scoreboard ──────────────────────────────────────────── */

export interface GameSide {
  id: number;
  name: string;
  abbr: string;
  score: number | null;
  /** The other two thirds of a line score, off the linescore rather than the
   *  schedule row — null for a game that hasn't started. */
  hits: number | null;
  errors: number | null;
  wins: number | null;
  losses: number | null;
  isWinner: boolean;
  probable: { id: number; name: string } | null;
}

/** Who won, lost and saved it — empty until a game is final. */
export interface Decisions {
  winner: { id: number; name: string } | null;
  loser: { id: number; name: string } | null;
  save: { id: number; name: string } | null;
}

export interface Game {
  pk: number;
  state: "Preview" | "Live" | "Final" | string;
  detailedState: string;
  startTime: string; // ISO
  venue: string;
  /** MLB's own day/night mark, which the stat feeds don't carry. */
  night: boolean;
  inning: number | null;
  inningState: string | null;
  away: GameSide;
  home: GameSide;
  decisions: Decisions;
  /** Tickets counted through the gate, null for a game not yet played. */
  attendance: number | null;
}

function side(raw: any, line: any): GameSide {
  const t = raw.team ?? {};
  return {
    id: t.id,
    name: t.name ?? "TBD",
    abbr: t.abbreviation ?? "—",
    score: typeof raw.score === "number" ? raw.score : null,
    hits: typeof line?.hits === "number" ? line.hits : null,
    errors: typeof line?.errors === "number" ? line.errors : null,
    wins: raw.leagueRecord?.wins ?? null,
    losses: raw.leagueRecord?.losses ?? null,
    isWinner: !!raw.isWinner,
    probable: person(raw.probablePitcher),
  };
}

export const toGame = (g: any): Game => ({
  pk: g.gamePk,
  state: g.status?.abstractGameState ?? "Preview",
  detailedState: g.status?.detailedState ?? "",
  startTime: g.gameDate,
  venue: g.venue?.name ?? "",
  night: g.dayNight === "night",
  inning: g.linescore?.currentInning ?? null,
  inningState: g.linescore?.inningState ?? null,
  away: side(g.teams?.away ?? {}, g.linescore?.teams?.away),
  home: side(g.teams?.home ?? {}, g.linescore?.teams?.home),
  decisions: {
    winner: person(g.decisions?.winner),
    loser: person(g.decisions?.loser),
    save: person(g.decisions?.save),
  },
  attendance: g.gameInfo?.attendance ?? null,
});

/** The pitcher of a decision or a probable, or null when there isn't one. */
const person = (p: any) =>
  p?.id ? { id: p.id, name: p.fullName ?? "—" } : null;

/* Decisions and the gate count ride along with every schedule read: they are
 * a few hundred bytes a game, and it keeps one hydrate string to keep right. */
export const SCHEDULE_HYDRATE = "probablePitcher,linescore,team,decisions,gameInfo";

export async function getSchedule(date: string): Promise<Game[]> {
  const data = await mlb(
    `/schedule?sportId=1&date=${date}&hydrate=${SCHEDULE_HYDRATE}`,
    60,
  );
  return (data.dates?.[0]?.games ?? []).map(toGame);
}

/**
 * One game's schedule row — the header half of /game/[pk] (records, status,
 * venue, probables), which the box score payload alone doesn't carry. Null for
 * an unknown gamePk so the route can 404.
 */
export async function getGame(pk: number): Promise<Game | null> {
  const data = await mlb(
    `/schedule?sportId=1&gamePk=${pk}&hydrate=${SCHEDULE_HYDRATE}`,
    60,
  );
  const g = data.dates?.[0]?.games?.[0];
  return g ? toGame(g) : null;
}

/** Scoreboard order — live first, then upcoming, then finals; earliest first. */
const STATE_ORDER: Record<string, number> = { Live: 0, Preview: 1, Final: 2 };

export const sortGames = (games: Game[]): Game[] =>
  games
    .slice()
    .sort(
      (a, b) =>
        (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) ||
        a.startTime.localeCompare(b.startTime),
    );

/**
 * Baseball's home zone, and the fallback for a first-pitch time whenever the
 * viewer's own can't be known — on the server, which renders in UTC, and in a
 * browser whose Intl won't name a zone.
 */
export const FALLBACK_TZ = "America/New_York";

/**
 * The one-line status a game shows everywhere: half-inning while live, the
 * detailed state once final, otherwise first pitch. `tone` picks the colour
 * without the caller re-deriving the state.
 *
 * First pitch carries its zone abbreviation ("7:05 PM PDT") so the number is
 * never ambiguous. The zone is passed in rather than left to Intl's default:
 * these cards are server-rendered, and the server's default is UTC, which is
 * nobody's local time. See useTimeZone for who supplies the viewer's.
 */
export function gameStatus(
  g: Game,
  timeZone: string = FALLBACK_TZ,
): {
  text: string;
  tone: "live" | "final" | "pre";
} {
  /* Warmup carries a Top 1 linescore before a pitch is thrown; say so. */
  if (g.detailedState === "Warmup") {
    return { text: "WARMUP", tone: "live" };
  }
  if (g.state === "Live") {
    const half = g.inningState ? g.inningState.slice(0, 3).toUpperCase() : "";
    return { text: `${half} ${g.inning ?? ""}`.trim(), tone: "live" };
  }
  if (g.state === "Final") {
    /* Extra innings carry the inning it ended in — "FINAL/10". */
    const extra = g.inning && g.inning > 9 ? `/${g.inning}` : "";
    return { text: g.detailedState.toUpperCase() + extra, tone: "final" };
  }
  return { text: clock(g.startTime, timeZone), tone: "pre" };
}

/*
 * The site is set in capitals; a browser tab is not. These two turn a
 * heading and a first pitch into the sentence case a tab strip is read in.
 * Both run in `generateMetadata`, on the server, where there is no viewer to
 * ask for a zone — so a game's day is its Pacific one, the same day the
 * scoreboard rolls over on.
 */

/** Initials that are words in their own right and stay shouted. */
const TITLE_KEEP = new Set(["ABS", "MLB", "AL", "NL", "WAR", "ERA", "WPA"]);

/** "PROBABLE PITCHERS — TODAY" → "Probable Pitchers — Today". */
export const titleCase = (s: string): string =>
  s.replace(/[A-Za-z]+/g, (w) =>
    TITLE_KEEP.has(w.toUpperCase())
      ? w.toUpperCase()
      : w[0].toUpperCase() + w.slice(1).toLowerCase(),
  );

/** A game day n days on, still as YYYY-MM-DD. UTC, so no zone shifts it. */
export const addDays = (iso: string, n: number): string =>
  new Date(
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)) + n,
    ),
  )
    .toISOString()
    .slice(0, 10);

/* "9/19/26". Read off the string's own parts rather than through a Date: a
   bare YYYY-MM-DD parses as UTC midnight, which is the evening before in
   every American zone. */
export const shortDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

/** "Sep 10, 2025" — the day a game belongs to. */
export const gameDay = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(iso));

/** "7:40 PM PDT" — a first pitch in the zone it is being read in. */
const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));

/** The same clock with the day it falls on — "7:40 PM PDT · TUE, SEP 1, 2026". */
export const firstPitch = (iso: string, timeZone: string): string =>
  `${clock(iso, timeZone)} · ${new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  })
    .format(new Date(iso))
    .toUpperCase()}`;
