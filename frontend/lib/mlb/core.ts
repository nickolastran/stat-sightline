/* The Stats API fetch every module here reads through, and the club, season and grouping helpers they share. */


const BASE = "https://statsapi.mlb.com/api/v1";

/*
 * A ceiling on any one upstream request. Without it a statsapi socket that
 * never answers hangs the whole render, and a prerendered page that hangs
 * burns Vercel's 60s static-generation budget and fails the build. Callers
 * already treat a throw as "no data for this panel", so a timeout degrades
 * the section rather than the deploy.
 */
export const FETCH_TIMEOUT_MS = 8000;

/** Division id → short name. These ids are fixed; no lookup needed. */
export const DIVISIONS: Record<number, string> = {
  200: "AL WEST",
  201: "AL EAST",
  202: "AL CENTRAL",
  203: "NL WEST",
  204: "NL EAST",
  205: "NL CENTRAL",
};

/*
 * The order the divisions are read in — east to west down each league, the way
 * every scoreboard prints them. Alphabetical order by name would open the
 * American League on its Central.
 */
export const DIVISION_ORDER = [201, 202, 200, 204, 205, 203];

/** League id → display name. Fixed alongside the division ids above. */
export const LEAGUES: Record<number, string> = {
  103: "AMERICAN LEAGUE",
  104: "NATIONAL LEAGUE",
};

/** Team logo — degrades to alt text if unreachable. */
/**
 * A club's page URL — `/team/137-san-francisco-giants`.
 *
 * The id leads so the route never has to look a name up, which matters for
 * the clubs that only exist in old standings (the 1884 Union Association is
 * not in the current teams list); the slug is there for the reader, and a
 * bare `/team/137` still resolves.
 */
export const teamHref = (id: number, name: string, tab = ""): string =>
  `/team/${id}${teamSlug(name)}${tab && `/${tab}`}`;

const teamSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `-${slug}` : "";
};

/** The club id out of a `137-san-francisco-giants` segment, or NaN. */
export const teamIdOf = (param: string): number =>
  /^\d+(-|$)/.test(param) ? Number.parseInt(param, 10) : NaN;

export const teamLogo = (id: number) =>
  `https://www.mlbstatic.com/team-logos/${id}.svg`;

/**
 * Each club's primary colour, by MLB id — the one thing about a team the API
 * never sends, so it is written down here. Used where two clubs are drawn
 * side by side and the accent can't stand for both.
 */
const TEAM_COLORS: Record<number, string> = {
  108: "#ba0021", // LAA
  109: "#a71930", // ARI
  110: "#df4601", // BAL
  111: "#bd3039", // BOS
  112: "#0e3386", // CHC
  113: "#c6011f", // CIN
  114: "#00385d", // CLE
  115: "#333366", // COL
  116: "#0c2340", // DET
  117: "#002d62", // HOU
  118: "#004687", // KC
  119: "#005a9c", // LAD
  120: "#ab0003", // WSH
  121: "#002d72", // NYM
  133: "#003831", // ATH
  134: "#c9a227", // PIT — gold, darkened enough to read on paper
  135: "#2f241d", // SD
  136: "#0c2c56", // SEA
  137: "#fd5a1e", // SF
  138: "#c41e3a", // STL
  139: "#092c5c", // TB
  140: "#003278", // TEX
  141: "#134a8e", // TOR
  142: "#002b5c", // MIN
  143: "#e81828", // PHI
  144: "#ce1141", // ATL
  145: "#27251f", // CWS
  146: "#00a3e0", // MIA
  147: "#0c2340", // NYY
  158: "#12284b", // MIL
};

/** A club's colour, falling back to the app's accent for anyone unlisted. */
export const teamColor = (id: number | undefined) =>
  (id && TEAM_COLORS[id]) || "var(--color-accent)";

/**
 * Player headshot, square. MLB's own CDN answers with a generic silhouette
 * for anyone it has no photo of, so a missing headshot needs no fallback of
 * ours — every id returns an image.
 */
/* The silo cutout rather than the "spot": both are transparent at the corners,
   but the spot fills its circle with the club's colour, and a list of players
   from eight clubs reads as eight coloured discs before it reads as faces. */
export const playerHeadshot = (id: number, size = 60) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_${size},q_auto:best/v1/people/${id}/headshot/silo/current.png`;

/*
 * The current game day, as YYYY-MM-DD. Pacific, not Eastern: a west-coast
 * night game is still today's game at 11pm ET, so rolling the scoreboard
 * over at midnight ET would swap the slate out from under a game in the
 * seventh. Midnight PT is the first moment no game is left in the day.
 */
export function todayPT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

export const seasonOf = (isoDate: string) => Number(isoDate.slice(0, 4));

/**
 * MLB's first season, and the floor of the leader boards' season picker —
 * the StatsAPI carries league leaders the whole way back, so 1876 is a real
 * bound rather than an arbitrary one.
 */
export const FIRST_SEASON = 1876;

/**
 * One Stats API call. Exported so lib/advanced.ts can reach the same feeds
 * through the same cache rather than opening a second client onto them.
 */
export async function mlb(path: string, revalidate: number): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${path}`);
  return res.json();
}

export const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
export function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const at = m.get(k);
  if (at) at.push(v);
  else m.set(k, [v]);
}
