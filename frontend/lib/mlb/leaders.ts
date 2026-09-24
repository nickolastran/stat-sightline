/* Leaderboards, club and player. */
import {
  mlb,
} from "./core";
import {
  inRotation,
  type TeamStatCol,
  teamStatNum,
  type TeamStatValue,
  WAR_COL,
} from "./stats";
import {
  type Game,
  toGame,
} from "./schedule";
import {
  latestByGame,
  seasonQualityStarts,
  seasonWar,
  warText,
} from "./teams";
import {
  playerCols,
  type PlayerGameType,
  type PlayerStatRow,
  type StatGroup,
} from "./players";
import {
  SABER_FORMAT,
} from "./career";


/* ── Leaderboards ───────────────────────────────────────────────────── */

export interface LeaderRow {
  rank: number;
  personId: number;
  name: string;
  team: string;
  value: string;
}

export interface Leaderboard {
  /** "group.category" — a category like strikeouts runs in both groups. */
  code: string;
  label: string;
  group: "hitting" | "pitching";
  /** The stat key the full board sorts on — where MORE hands the reader off. */
  stat: string;
  leaders: LeaderRow[];
}

/**
 * (category, statGroup, display label) for each board we surface, in the
 * order they fill the grid. WAR has no place here — the StatsAPI publishes
 * no such leader category, since the figure is a third-party derivation
 * (bWAR, fWAR) rather than an official MLB stat.
 */
const LEADER_SPECS: {
  cat: string;
  group: "hitting" | "pitching";
  label: string;
  /* The same figure under its `stat` key, which is what the full player table
     sorts on — the leader categories have names of their own. */
  stat: string;
}[] = [
  { cat: "battingAverage", group: "hitting", label: "AVG", stat: "avg" },
  { cat: "onBasePlusSlugging", group: "hitting", label: "OPS", stat: "ops" },
  { cat: "hits", group: "hitting", label: "HITS", stat: "hits" },
  { cat: "doubles", group: "hitting", label: "DOUBLES", stat: "doubles" },
  { cat: "triples", group: "hitting", label: "TRIPLES", stat: "triples" },
  { cat: "homeRuns", group: "hitting", label: "HOME RUNS", stat: "homeRuns" },
  { cat: "runsBattedIn", group: "hitting", label: "RBI", stat: "rbi" },
  {
    cat: "strikeouts",
    group: "hitting",
    label: "STRIKEOUTS",
    stat: "strikeOuts",
  },
  { cat: "walks", group: "hitting", label: "WALKS", stat: "baseOnBalls" },
  {
    cat: "stolenBases",
    group: "hitting",
    label: "STOLEN BASES",
    stat: "stolenBases",
  },
  { cat: "earnedRunAverage", group: "pitching", label: "ERA", stat: "era" },
  { cat: "wins", group: "pitching", label: "WINS", stat: "wins" },
  { cat: "losses", group: "pitching", label: "LOSSES", stat: "losses" },
  {
    cat: "inningsPitched",
    group: "pitching",
    label: "INNINGS PITCHED",
    stat: "inningsPitched",
  },
  {
    cat: "strikeouts",
    group: "pitching",
    label: "STRIKEOUTS",
    stat: "strikeOuts",
  },
  { cat: "walks", group: "pitching", label: "WALKS", stat: "baseOnBalls" },
  {
    cat: "earnedRun",
    group: "pitching",
    label: "EARNED RUNS",
    stat: "earnedRuns",
  },
  { cat: "whip", group: "pitching", label: "WHIP", stat: "whip" },
  { cat: "saves", group: "pitching", label: "SAVES", stat: "saves" },
];

async function oneBoard(
  spec: (typeof LEADER_SPECS)[number],
  season: number,
  limit: number,
): Promise<Leaderboard> {
  const data = await mlb(
    `/stats/leaders?leaderCategories=${spec.cat}&statGroup=${spec.group}&season=${season}&sportId=1&limit=${limit}`,
    1800,
  );
  const leaders = (data.leagueLeaders?.[0]?.leaders ?? []) as any[];
  return {
    code: `${spec.group}.${spec.cat}`,
    label: spec.label,
    group: spec.group,
    stat: spec.stat,
    leaders: leaders.map(
      (l): LeaderRow => ({
        rank: l.rank,
        personId: l.person?.id,
        name: l.person?.fullName ?? "—",
        team: l.team?.name ?? "",
        value: l.value,
      }),
    ),
  };
}

/**
 * The WAR card, which the leaders endpoint can't serve — MLB publishes no WAR
 * leader category, so this reads the sabermetrics feed instead. It arrives
 * ranked by WAR already, over MLB's own qualified pool, which is the same
 * pool every other card is drawn from.
 *
 */
async function warBoard(
  group: "hitting" | "pitching",
  season: number,
  limit: number,
): Promise<Leaderboard> {
  const data = await mlb(
    `/stats?stats=sabermetrics&group=${group}&season=${season}&sportId=1&limit=${limit}`,
    1800,
  ).catch(() => null);
  const splits = (data?.stats?.[0]?.splits ?? []) as any[];
  return {
    code: `${group}.war`,
    label: "WAR",
    group,
    stat: "war",
    leaders: splits.flatMap((s, i): LeaderRow[] => {
      const war = teamStatNum(s.stat?.war);
      return war === null
        ? []
        : [
            {
              rank: s.rank ?? i + 1,
              personId: s.player?.id,
              name: s.player?.fullName ?? "—",
              team: s.team?.name ?? "",
              value: SABER_FORMAT.war(war),
            },
          ];
    }),
  };
}

/**
 * The quality starts card. MLB publishes no such leader category — the same
 * gap WAR has — so this ranks the advanced line itself. Ties share a rank,
 * the way every other card's do, which is what the "T-" mark reads off.
 */
async function qsBoard(season: number, limit: number): Promise<Leaderboard> {
  const lines = (await seasonQualityStarts(season)).sort((a, b) => b.qs - a.qs);
  const top = lines.slice(0, limit);
  return {
    code: "pitching.qualityStarts",
    label: "QUALITY STARTS",
    group: "pitching",
    stat: "qualityStarts",
    leaders: top.map(
      (l): LeaderRow => ({
        rank: lines.findIndex((x) => x.qs === l.qs) + 1,
        personId: l.id,
        name: l.name,
        team: l.team,
        value: String(l.qs),
      }),
    ),
  };
}

export async function getLeaderboards(
  season: number,
  limit = 20,
): Promise<Leaderboard[]> {
  return Promise.all([
    /* WAR opens each group — it is the one figure on the page that answers
       "who had the best season" rather than "who led one column". */
    warBoard("hitting", season, limit),
    warBoard("pitching", season, limit),
    ...LEADER_SPECS.map((s) => oneBoard(s, season, limit)),
    /* Last of the pitching cards rather than in the spec list — it is ranked
       here rather than by MLB, so it isn't one of them. */
    qsBoard(season, limit),
  ]);
}

/* ── League-wide player leaders ─────────────────────────────────────── */

/** One line of the full player leaderboard — a stat table row with a rank. */
export interface StatLeaderRow extends PlayerStatRow {
  /** MLB's own rank in the sort, ties sharing a number — renumbered 1..n
   *  where the board did its own ordering. */
  rank: number | null;
  team: string;
  teamId: number | null;
  /** Clubs the player played for this season; >1 means a trade split it. */
  teams: number;
}

/** Enough rows to hold any qualified pool — MLB's qualifier keeps it small. */
const WHOLE_BOARD = 1000;

export interface StatLeaderPage {
  rows: StatLeaderRow[];
  /** Everyone who qualifies, not just the rows fetched — what MORE reads. */
  total: number;
}

export const LEADER_LEAGUES = [
  { value: "all", label: "ALL LEAGUES" },
  { value: "103", label: "AMERICAN LEAGUE" },
  { value: "104", label: "NATIONAL LEAGUE" },
];

/** Every position MLB files a player under — what a fielding board reads by. */
export const LEADER_POSITIONS = [
  { value: "all", label: "ALL POSITIONS" },
  { value: "P", label: "PITCHER" },
  { value: "C", label: "CATCHER" },
  { value: "1B", label: "FIRST BASE" },
  { value: "2B", label: "SECOND BASE" },
  { value: "3B", label: "THIRD BASE" },
  { value: "SS", label: "SHORTSTOP" },
  { value: "IF", label: "INFIELD" },
  { value: "LF", label: "LEFT FIELD" },
  { value: "CF", label: "CENTER FIELD" },
  { value: "RF", label: "RIGHT FIELD" },
  { value: "OF", label: "OUTFIELD" },
  { value: "DH", label: "DESIGNATED HITTER" },
];

/* A hitting board has no pitchers on it, so it doesn't offer them; a pitching
   board is all pitchers, so what it offers is the two jobs an arm has. */
const BATTER_POSITIONS = LEADER_POSITIONS.filter((p) => p.value !== "P");

const PITCHER_POSITIONS = [
  { value: "all", label: "ALL PITCHERS" },
  { value: "SP", label: "STARTING PITCHERS" },
  { value: "RP", label: "RELIEF PITCHERS" },
];

/** The POS choices a board of this group can be read by. */
export const leaderPositions = (group: StatGroup) =>
  group === "hitting"
    ? BATTER_POSITIONS
    : group === "pitching"
      ? PITCHER_POSITIONS
      : LEADER_POSITIONS;

/** What each group is ranked by until the reader picks a column. */
export const defaultLeaderStat = (group: StatGroup): string =>
  group === "hitting" ? "avg" : group === "pitching" ? "era" : "fielding";

/** A `?stat=` that names a column of this group's table, else its default. */
/**
 * Which way a board that is already sorted actually runs, read off its own
 * values rather than declared per stat: MLB ranks most stats high to low but
 * ERA, WHIP and opponent average low to high, and a column has to know its
 * current direction to offer the opposite. Missing values are skipped, and a
 * board with nothing to compare — one row, all ties, all blank — reads as
 * descending, which is the common case and what MLB's default usually is.
 */
export const boardDir = (values: TeamStatValue[]): "asc" | "desc" => {
  const nums = values.map(teamStatNum).filter((n): n is number => n !== null);
  return nums.length > 1 && nums[nums.length - 1] > nums[0] ? "asc" : "desc";
};

/** The sort direction off the query string — anything else means MLB's own. */
export const pickLeaderOrder = (
  raw: string | undefined,
): "asc" | "desc" | undefined =>
  raw === "asc" || raw === "desc" ? raw : undefined;

/**
 * Quality starts, which the standard season line doesn't count — six innings
 * or more on three earned runs or fewer. The advanced line is the only feed
 * that carries it, so the board joins it on the way it joins WAR.
 */
export const QS_COL: TeamStatCol = {
  key: "qualityStarts",
  label: "QS",
  title: "Starts of six innings or more on three earned runs or fewer",
};

/**
 * The player board's columns: WAR ahead of the standard line, and quality
 * starts beside the starts they are counted from. Fielding has no
 * sabermetric line at all, so it has neither column.
 */
export const leaderCols = (group: StatGroup): TeamStatCol[] =>
  group === "fielding"
    ? playerCols(group)
    : [
        WAR_COL,
        ...playerCols(group).flatMap((c) =>
          c.key === "gamesStarted" ? [c, QS_COL] : [c],
        ),
      ];

export const pickLeaderStat = (
  raw: string | undefined,
  group: StatGroup,
): string =>
  leaderCols(group).some((c) => c.key === raw)
    ? raw!
    : defaultLeaderStat(group);

/**
 * What a player has to do to appear at all — MLB's own rule, which the table
 * prints under itself so a missing name is explained rather than a mystery.
 */
export const QUALIFIER_NOTE: Record<StatGroup, string> = {
  hitting: "To qualify, a player must have at least 3.1 PA/game",
  pitching: "To qualify, a pitcher must have at least 1 IP/game",
  fielding: "Qualified fielders only — MLB's own pool at each position",
};

/** The same, for a board that sets its own bar — the bullpen's. */
export const qualifierNote = (group: StatGroup, position: string): string =>
  position === "RP"
    ? "Relievers only, from half the appearances of the league's busiest arm — MLB's 1 IP/game qualifier admits no reliever"
    : QUALIFIER_NOTE[group];

/**
 * Every club a season a trade split was played for — "MIN/HOU", the one the
 * player is on now last. The board's own payload names only that current club,
 * and a line reading HOU for fifty-one games says nothing about the
 * ninety-three before them.
 *
 * The per-club rows come back ordered by team id rather than by when they were
 * played, so `current` is what puts them in order: it is the club MLB reports
 * the player on, and the rest led it.
 */
async function tradedTeams(
  id: number,
  season: number,
  group: StatGroup,
  gameType: PlayerGameType,
  current: string,
): Promise<string | null> {
  const data = await mlb(
    `/people/${id}/stats?stats=season&group=${group}&season=${season}` +
      `&sportId=1&gameType=${gameType}&hydrate=team`,
    1800,
  );
  /* The payload leads with the combined line, which has no club of its own —
     the per-club rows are the ones that name a team. */
  const stops = ((data.stats?.[0]?.splits ?? []) as any[])
    .map((s) => s.team?.abbreviation)
    .filter((a): a is string => Boolean(a));
  if (stops.length < 2) return null;
  return [...stops.filter((a) => a !== current), current].join("/");
}

/**
 * The league's players in one group, ranked by one stat — the full board the
 * leader cards hand off to.
 *
 * The sort, the qualifying pool and the paging are all MLB's: ranking a page
 * of rows we already hold would rank the wrong 50 players. `limit` is what
 * MORE grows, so each press is one wider request rather than a stitched-
 * together list.
 */
export async function getStatLeaders({
  season,
  group,
  gameType = "R",
  stat,
  league = "all",
  position = "all",
  limit = 50,
  offset = 0,
  order,
}: {
  season: number;
  group: StatGroup;
  gameType?: PlayerGameType;
  stat: string;
  /** "103" / "104", or "all" for both. */
  league?: string;
  /** A position abbreviation, or "all". */
  position?: string;
  limit?: number;
  /** Rows already on screen — what a page beyond the first starts after. */
  offset?: number;
  /**
   * Numeric direction, overriding MLB's own. Left off, the board arrives the
   * way MLB ranks that stat — best first, which is descending for a counting
   * stat but ascending for ERA, WHIP and opponent average. Set it to the
   * opposite of what came back to read the board from the bottom.
   */
  order?: "asc" | "desc";
}): Promise<StatLeaderPage> {
  /*
   * WAR and quality starts are the two columns MLB can't rank: both live on
   * feeds of their own, and the stats endpoint silently ignores a `sortStat`
   * it doesn't know rather than refusing it, which would leave the board in
   * somebody else's order under the heading that was clicked. So a sort on
   * either asks for the whole qualified pool in one request and does the
   * ordering here. That pool is a couple of hundred players — MLB's
   * qualifier is what keeps it small — so this is one request either way,
   * not a page's worth more.
   */
  const ranked = stat === "war" || stat === "qualityStarts";
  /*
   * The other column MLB can't answer: every arm is filed under position "P",
   * so `position=SP` comes back as the whole pitching board rather than the
   * rotation. Starter or reliever is read off the line instead — the same
   * reading a roster page uses — which again means the whole pool arrives and
   * is filtered and paged here.
   */
  const byRole = position === "SP" || position === "RP";
  /* MLB's pitching qualifier is an inning per team game, which no reliever
     has ever thrown — asking for the qualified pool would answer a bullpen
     board with nobody on it, so the bullpen is drawn from every arm and given
     a bar of its own below. */
  const relief = position === "RP";
  const whole = ranked || byRole;
  const [data, war, qs] = await Promise.all([
    mlb(
      `/stats?stats=season&group=${group}&season=${season}&sportId=1` +
        `&gameType=${gameType}&hydrate=team` +
        `&playerPool=${relief ? "all" : "qualified"}` +
        `&sortStat=${ranked ? defaultLeaderStat(group) : stat}` +
        `&limit=${whole ? WHOLE_BOARD : limit}&offset=${whole ? 0 : offset}` +
        (order && !ranked ? `&order=${order}` : "") +
        (league === "all" ? "" : `&leagueId=${league}`) +
        (position === "all" || byRole ? "" : `&position=${position}`),
      1800,
    ),
    seasonWar(season, group, gameType),
    group === "pitching" ? seasonQualityStarts(season, gameType) : [],
  ]);
  const qsBy = new Map(qs.map((l) => [l.id, l.qs]));
  const columns = playerCols(group);
  const board = data.stats?.[0];
  const splits = (board?.splits ?? []) as any[];
  let rows = splits.map(
    (s): StatLeaderRow => ({
      rank: s.rank ?? null,
      id: s.player?.id,
      name: s.player?.fullName ?? "—",
      position: s.position?.abbreviation ?? "",
      team: s.team?.abbreviation ?? "",
      teamId: s.team?.id ?? null,
      /* Carried so the trade lookup below can still find the multi-club
         players after a WAR sort has moved them. */
      teams: s.numTeams ?? 1,
      values: {
        ...Object.fromEntries(
          columns.map((c) => [c.key, s.stat?.[c.key] ?? null]),
        ),
        /* WAR and quality starts come from feeds of their own, so they are
           joined on by player id rather than read off this split. */
        war: warText(war.player.get(s.player?.id)),
        qualityStarts: qsBy.get(s.player?.id) ?? null,
      },
    }),
  );

  if (byRole) {
    const starter = (r: StatLeaderRow) =>
      inRotation(
        teamStatNum(r.values.gamesStarted) ?? 0,
        teamStatNum(r.values.gamesPlayed) ?? 0,
      );
    rows = rows.filter((r) => starter(r) === (position === "SP"));
  }

  if (relief) {
    /* A bullpen board has to keep the September call-up's two scoreless
       innings from leading the league in ERA, and MLB publishes no bar to
       use — so the board sets one off itself: half the work the busiest arm
       in the league has been given, which is around 35 appearances over a
       full season and scales down to what a bullpen has actually thrown in
       April.
       ponytail: a self-scaled bar, not MLB's — a published reliever
       qualifier would replace it if one ever existed. */
    const apps = (r: StatLeaderRow) => teamStatNum(r.values.gamesPlayed) ?? 0;
    const bar = Math.max(0, ...rows.map(apps)) / 2;
    rows = rows.filter((r) => apps(r) >= bar);
  }

  if (ranked) {
    /* Best first, like every other column's first click. A player the feed
       has no figure for sinks to the bottom in both directions rather than
       reading as the worst season in the league. */
    const sign = order === "asc" ? 1 : -1;
    rows = rows.sort((a, b) => {
      const va = teamStatNum(a.values[stat]);
      const vb = teamStatNum(b.values[stat]);
      if (va === null) return vb === null ? 0 : 1;
      if (vb === null) return -1;
      return (va - vb) * sign;
    });
  }

  /* A board ordered or thinned here carries its own count and its own ranks —
     MLB's are for the pool it sent, not the one being read. */
  const total = whole ? rows.length : (board?.totalSplits ?? 0);
  if (whole) {
    rows = rows
      .map((r, i) => ({ ...r, rank: i + 1 }))
      .slice(offset, offset + limit);
  }

  /* Only the handful a trade moved cost a request of their own, and a failed
     one leaves the club they finished the season on rather than no club. */
  await Promise.all(
    rows.map(async (r) => {
      if (r.teams < 2) return;
      const stops = await tradedTeams(
        r.id,
        season,
        group,
        gameType,
        r.team,
      ).catch(() => null);
      if (stops) r.team = stops;
    }),
  );

  return { total, rows };
}

/**
 * What the pitchers of record carried out of each game — the line the reader
 * sees beside a decision, "(1-0)" for a first win of the year rather than the
 * season total the pitcher finished with.
 *
 * MLB reports the as-of figure only inside a game's own box score, so it is
 * counted here instead: one league-wide schedule read names a winner, a loser
 * and a saver per game, and walking the season in order gives every pitcher's
 * running line without a request per row.
 */
export interface PitcherRecord {
  wins: number;
  losses: number;
  saves: number;
}

/** Records as they stood after each game, keyed `${gamePk}:${pitcherId}`. */
export function runningRecords(games: Game[]): Map<string, PitcherRecord> {
  const running = new Map<number, PitcherRecord>();
  const asOf = new Map<string, PitcherRecord>();
  for (const g of games) {
    for (const [role, key] of [
      ["winner", "wins"],
      ["loser", "losses"],
      ["save", "saves"],
    ] as const) {
      const p = g.decisions[role];
      if (!p) continue;
      const r = running.get(p.id) ?? { wins: 0, losses: 0, saves: 0 };
      r[key] += 1;
      running.set(p.id, r);
      asOf.set(`${g.pk}:${p.id}`, { ...r });
    }
  }
  return asOf;
}

export async function getPitcherRecords(
  season: number,
): Promise<Map<string, PitcherRecord>> {
  const data = await mlb(
    `/schedule?sportId=1&season=${season}&gameType=R,F,D,L,W&hydrate=decisions` +
      `&fields=dates,games,gamePk,gameDate,decisions,winner,loser,save,id,fullName`,
    1800,
  );
  return runningRecords(
    latestByGame(
      ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? []).map(toGame),
    ),
  );
}

/** Every pitcher's season ERA, keyed by id — the figure a decision is read
 *  with. One filtered read of the season feed, which is under a thousand arms. */
async function seasonEras(season: number): Promise<Map<number, string>> {
  const data = await mlb(
    `/stats?stats=season&group=pitching&season=${season}&sportId=1` +
      `&playerPool=all&limit=2000&fields=stats,splits,player,id,stat,era`,
    1800,
  );
  const out = new Map<number, string>();
  for (const sp of (data.stats?.[0]?.splits ?? []) as any[])
    if (sp.player?.id && sp.stat?.era) out.set(sp.player.id, sp.stat.era);
  return out;
}

/**
 * The line each pitcher of record is read with on a scoreboard card —
 * "(8-7, 3.95)" for a win or a loss, "(16)" for a save — keyed
 * `${gamePk}:${pitcherId}`.
 *
 * The record is the one the pitcher carried out of that game, the way the
 * schedule already works it out for a club's season. Either feed failing
 * leaves the names on the card without their line rather than no card.
 *
 * ponytail: the ERA is the season's to date, not the one he took off the
 * mound that day — an as-of-game figure would be a box score per game on the
 * slate. Fine for today's slate, a little generous on an old one.
 */
export async function getDecisionLines(
  games: Game[],
  season: number,
): Promise<Map<string, string>> {
  const [records, eras] = await Promise.all([
    getPitcherRecords(season).catch(() => new Map<string, PitcherRecord>()),
    seasonEras(season).catch(() => new Map<number, string>()),
  ]);
  const out = new Map<string, string>();
  for (const g of games) {
    for (const role of ["winner", "loser", "save"] as const) {
      const p = g.decisions[role];
      if (!p) continue;
      const r = records.get(`${g.pk}:${p.id}`);
      const era = eras.get(p.id);
      const parts =
        role === "save"
          ? r
            ? [String(r.saves)]
            : []
          : [r ? `${r.wins}-${r.losses}` : "", era ?? ""].filter(Boolean);
      if (parts.length) out.set(`${g.pk}:${p.id}`, `(${parts.join(", ")})`);
    }
  }
  return out;
}

/**
 * The All-Star Game, the seam a season is read in halves either side of. Null
 * for a season that never played one, which leaves the split to game count.
 */
export async function getBreakDate(season: number): Promise<string | null> {
  const data = await mlb(
    `/schedule?sportId=1&season=${season}&gameType=A&fields=dates,games,gameDate`,
    86400,
  );
  const g = ((data.dates ?? []) as any[]).flatMap((d) => d.games ?? [])[0];
  return g?.gameDate ?? null;
}

/** Index of the first game after the break — where a season's halves part. */
export function breakIndex(games: Game[], breakAt: string | null): number {
  if (!breakAt) return Math.ceil(games.length / 2);
  const i = games.findIndex((g) => g.startTime > breakAt);
  return i === -1 ? games.length : i;
}
