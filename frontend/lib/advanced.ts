/*
 * The advanced boards — every figure that isn't a regular stat.
 *
 * Two sources, joined on player or club id. MLB's Stats API carries the
 * derived sabermetrics (FanGraphs' WAR, wRC+, FIP, xFIP, the leverage
 * indices) and its own rate line — BABIP, ISO, walk and strikeout shares.
 * Everything measured off the ball itself — exit velocity, barrels, bat
 * speed, expected outcomes, outs above average — lives only on Baseball
 * Savant, which publishes each of its leaderboards as CSV. lib/abs.ts
 * already reads Savant for the challenge boards; this reads the rest.
 *
 * Savant's CSV endpoints are undocumented, so every one of them is fetched
 * behind `orNone`: a board that stops answering costs its own columns rather
 * than the page. The spine — who is on the board at all — is always MLB's,
 * so the table still renders in full with Savant dark.
 *
 * Server-only, like lib/mlb.ts. Cached for an hour: none of this moves more
 * than once a day.
 */
import {
  getClubs,
  mlb,
  teamStatNum,
  type TeamStatCol,
  type TeamStatValue,
} from "./mlb";

/** Statcast's first full season — before it there is no tracking at all. */
export const ADV_FIRST_SEASON = 2015;

/** How many recent seasons the hover menu lists before handing over to ALL. */
export const MENU_SEASONS = 6;

export const ADV_VIEWS = [
  {
    id: "player-batting",
    label: "PLAYER BATTING",
    title: "ADVANCED BATTING — PLAYERS",
  },
  {
    id: "player-pitching",
    label: "PLAYER PITCHING",
    title: "ADVANCED PITCHING — PLAYERS",
  },
  {
    id: "league-batting",
    label: "LEAGUE BATTING",
    title: "ADVANCED BATTING — CLUBS",
  },
  {
    id: "league-pitching",
    label: "LEAGUE PITCHING",
    title: "ADVANCED PITCHING — CLUBS",
  },
  { id: "top", label: "TOP PERFORMERS", title: "ADVANCED TOP PERFORMERS" },
] as const;

export type AdvView = (typeof ADV_VIEWS)[number]["id"];

export const findAdvView = (id: string) => ADV_VIEWS.find((v) => v.id === id);

/** Only the player boards run deep enough for a year-by-year index. */
export const hasAllYears = (id: AdvView) => id.startsWith("player-");

/** A `?season=` inside the tracking era, else the running season. */
export const pickAdvSeason = (raw: string | undefined, current: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= ADV_FIRST_SEASON && n <= current
    ? n
    : current;
};

/* ── CSV ────────────────────────────────────────────────────────────── */

/**
 * Savant's CSV into rows keyed by its header. Quoted fields are the whole
 * reason this isn't a `split(",")`: the first column of half these boards is
 * `"Last, First"`, so a naive split shifts every figure on the row one
 * column left and the board reads as a different player's season.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  /* The BOM Savant leads with is part of the first header name otherwise. */
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      /* CRLF is one break, not two. A trailing newline ends the last row
         rather than opening an empty one. */
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) rows.push([...row, field]);

  const head = rows.shift();
  if (!head) return [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const SAVANT = "https://baseballsavant.mlb.com/leaderboard";

/**
 * One Savant leaderboard. It answers a bad parameter with the page itself
 * rather than a status, so an HTML body is treated as the failure it is —
 * otherwise the CSV parser would happily turn markup into one nonsense row.
 */
async function savantCsv(
  board: string,
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  const query = new URLSearchParams({ ...params, csv: "true" });
  const res = await fetch(`${SAVANT}/${board}?${query}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Savant ${board} ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<"))
    throw new Error(`Savant ${board}: page, not CSV`);
  return parseCsv(text);
}

/** A source whose absence costs its columns and nothing else. */
const orNone = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

/** Rows by the id they join on — a missing or unparseable id drops out. */
const byId = (rows: Record<string, string>[], key: string) =>
  new Map(
    rows.flatMap((r) => {
      const id = Number(r[key]);
      return Number.isFinite(id) ? ([[id, r]] as [number, typeof r][]) : [];
    }),
  );

/** Savant writes people "Last, First"; every other board here doesn't. */
export const flipName = (name: string): string => {
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : (last ?? "");
};

/* ── Columns ────────────────────────────────────────────────────────── */

type Raw = string | number | null | undefined;

/**
 * A column, and where its figure comes from: `src` names one of the feeds a
 * board fetched and `raw` its key in that feed's row, so a column is declared
 * once rather than being half a column list and half a mapping table.
 */
export interface AdvCol extends TeamStatCol {
  /** The band it sits under — what splits a 40-column table into readable runs. */
  group: string;
  src: string;
  raw: string;
  fmt: (v: Raw) => TeamStatValue;
  /** Printed after the value on a leader card, where there is room for it. */
  unit?: string;
  /** Set where a low number is the good one — which way the first click sorts. */
  best?: "asc";
}

const num = (v: Raw): number | null =>
  v === null || v === undefined || v === "" ? null : teamStatNum(String(v));

/** A plain figure at a fixed precision — "89.3", "4.12". */
const dec =
  (places: number) =>
  (v: Raw): TeamStatValue => {
    const n = num(v);
    return n === null ? null : n.toFixed(places);
  };

/** A fraction as the percentage it is — .241 becomes "24.1". */
const pct =
  (places = 1) =>
  (v: Raw): TeamStatValue => {
    const n = num(v);
    return n === null ? null : (n * 100).toFixed(places);
  };

/** A batting-line rate, leading zero dropped — ".312". */
const rate = (v: Raw): TeamStatValue => {
  const n = num(v);
  return n === null ? null : n.toFixed(3).replace(/^(-?)0\./, "$1.");
};

/** A signed run or win total, where the sign is the point of it. */
const signed =
  (places: number) =>
  (v: Raw): TeamStatValue => {
    const n = num(v);
    return n === null ? null : (n > 0 ? "+" : "") + n.toFixed(places);
  };

const whole = (v: Raw): TeamStatValue => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/* Every figure is stored as the string it prints, with the unit left off, so
   one `teamStatNum` still parses it back for sorting. "24.1%" would not. */

const col = (
  group: string,
  src: string,
  raw: string,
  label: string,
  title: string,
  fmt: (v: Raw) => TeamStatValue,
  extra: { key?: string; unit?: string; best?: "asc" } = {},
): AdvCol => ({
  key: extra.key ?? `${src}.${raw}`,
  label,
  title,
  group,
  src,
  raw,
  fmt,
  /* A column whose abbreviation already ends in % carries the sign on a
     leader card, where there is room for it — the table's own heading is
     the % and printing it twice down the column only costs width. */
  unit: extra.unit ?? (label.endsWith("%") ? "%" : undefined),
  best: extra.best,
});

/* The sabermetric line, which is FanGraphs' arithmetic served by MLB. */
const SABER_BATTING: AdvCol[] = [
  col("SABERMETRIC", "saber", "war", "WAR", "Wins above replacement (FanGraphs, via MLB)", dec(1)),
  col("SABERMETRIC", "saber", "rar", "RAR", "Runs above replacement", dec(1)),
  col("SABERMETRIC", "saber", "woba", "wOBA", "Weighted on-base average — every way of reaching base at its run value", rate),
  col("SABERMETRIC", "saber", "wRc", "wRC", "Weighted runs created", dec(0)),
  col("SABERMETRIC", "saber", "wRcPlus", "wRC+", "Weighted runs created against the league, park-adjusted — 100 is average", dec(0)),
  col("SABERMETRIC", "saber", "wRaa", "wRAA", "Weighted runs above average", signed(1)),
  col("SABERMETRIC", "saber", "batting", "Rbat", "Batting runs above average", signed(1)),
  col("SABERMETRIC", "saber", "baseRunning", "Rbsr", "Base-running runs above average", signed(1)),
  col("SABERMETRIC", "saber", "positional", "Rpos", "Positional adjustment runs", signed(1)),
  col("SABERMETRIC", "saber", "spd", "SPD", "Speed score", dec(1)),
  col("SABERMETRIC", "saber", "ubr", "UBR", "Ultimate base running — run value outside stolen bases", signed(1)),
  col("SABERMETRIC", "saber", "wSb", "wSB", "Weighted stolen-base runs", signed(1)),
  col("SABERMETRIC", "saber", "wGdp", "wGDP", "Weighted double-play runs", signed(1)),
];

const EXPECTED_BATTING: AdvCol[] = [
  col("EXPECTED", "x", "est_ba", "xBA", "Expected batting average from contact quality", rate),
  col("EXPECTED", "x", "est_slg", "xSLG", "Expected slugging from contact quality", rate),
  col("EXPECTED", "x", "est_woba", "xwOBA", "Expected weighted on-base average", rate),
  col("EXPECTED", "x", "est_ba_minus_ba_diff", "xBA∆", "Expected batting average less the real one", signed(3)),
  col("EXPECTED", "x", "est_slg_minus_slg_diff", "xSLG∆", "Expected slugging less the real one", signed(3)),
  col("EXPECTED", "x", "est_woba_minus_woba_diff", "xwOBA∆", "Expected wOBA less the real one", signed(3)),
];

/* What the ball did off the bat. Savant's own percentages arrive already
   multiplied out, so these take the figure as given. */
const CONTACT = (verb: string): AdvCol[] => [
  col("BATTED BALL", "ev", "avg_hit_speed", "EV", `Average exit velocity ${verb}`, dec(1), { unit: " MPH" }),
  col("BATTED BALL", "ev", "ev50", "EV50", `Average of the hardest half of balls ${verb}`, dec(1), { unit: " MPH" }),
  col("BATTED BALL", "ev", "max_hit_speed", "MAXEV", `The hardest ball ${verb}`, dec(1), { unit: " MPH" }),
  col("BATTED BALL", "ev", "ev95percent", "HH%", `Share of contact at 95 MPH or more ${verb}`, dec(1), { unit: "%" }),
  col("BATTED BALL", "ev", "brl_percent", "BRL%", "Barrels per batted ball — the exit-velocity and launch-angle pairings that produce extra bases", dec(1), { unit: "%" }),
  col("BATTED BALL", "ev", "brl_pa", "BRL/PA", "Barrels per plate appearance", dec(1), { unit: "%" }),
  col("BATTED BALL", "ev", "anglesweetspotpercent", "SWSP%", "Share of contact launched between eight and thirty-two degrees", dec(1), { unit: "%" }),
  col("BATTED BALL", "ev", "avg_hit_angle", "LA", "Average launch angle", dec(1), { unit: "°" }),
  col("BATTED BALL", "ev", "avg_distance", "DIST", "Average distance of a batted ball", whole, { unit: " FT" }),
  col("BATTED BALL", "ev", "avg_hr_distance", "HRDST", "Average home-run distance", whole, { unit: " FT" }),
];

/* Bat tracking, which Savant has published since 2023 — blank before it. */
const SWING: AdvCol[] = [
  col("SWING", "bat", "avg_bat_speed", "BATSPD", "Average bat speed on a competitive swing", dec(1), { unit: " MPH" }),
  col("SWING", "bat", "hard_swing_rate", "FAST%", "Share of swings at 75 MPH or more", pct()),
  col("SWING", "bat", "swing_length", "LEN", "Average length of the bat's path to contact", dec(1), { unit: " FT" }),
  col("SWING", "bat", "squared_up_per_swing", "SQ%", "Squared-up swings — contact taking most of the available exit velocity", pct()),
  col("SWING", "bat", "blast_per_swing", "BLST%", "Blasts — a squared-up swing that was also a fast one", pct()),
  col("SWING", "bat", "whiff_per_swing", "WHF%", "Swings missed", pct()),
  col("SWING", "bat", "percent_swings_competitive", "CMP%", "Swings that were a real attempt rather than a check or an emergency", pct()),
  col("SWING", "bat", "swords", "SWRD", "Swords — swings so far off the pitch they end the at-bat as a curiosity", whole),
  col("SWING", "bat", "batter_run_value", "SWRV", "Run value of the batter's swing decisions and contact", signed(1)),
];

/* MLB's own rate line — the part of `seasonAdvanced` that isn't a count. */
const PLATE_BATTING: AdvCol[] = [
  col("PLATE", "adv", "babip", "BABIP", "Batting average on balls in play", rate),
  col("PLATE", "adv", "iso", "ISO", "Isolated power — slugging less batting average", rate),
  col("PLATE", "adv", "walksPerPlateAppearance", "BB%", "Walks per plate appearance", pct()),
  col("PLATE", "adv", "strikeoutsPerPlateAppearance", "K%", "Strikeouts per plate appearance", pct(), { best: "asc" }),
  col("PLATE", "adv", "homeRunsPerPlateAppearance", "HR%", "Home runs per plate appearance", pct()),
  col("PLATE", "adv", "walksPerStrikeout", "BB/K", "Walks per strikeout", dec(2)),
  col("PLATE", "adv", "pitchesPerPlateAppearance", "P/PA", "Pitches seen per plate appearance", dec(2)),
];

export const ADV_BATTING_COLS: AdvCol[] = [
  ...SABER_BATTING,
  ...EXPECTED_BATTING,
  ...CONTACT("hit"),
  ...SWING,
  ...PLATE_BATTING,
];

const SABER_PITCHING: AdvCol[] = [
  col("SABERMETRIC", "saber", "war", "WAR", "Wins above replacement (FanGraphs, via MLB)", dec(1)),
  col("SABERMETRIC", "saber", "ra9War", "RA9WAR", "Wins above replacement figured from runs allowed rather than FIP", dec(1)),
  col("SABERMETRIC", "saber", "rar", "RAR", "Runs above replacement", dec(1)),
  col("SABERMETRIC", "saber", "fip", "FIP", "Fielding independent pitching — ERA from the outcomes a pitcher alone controls", dec(2), { best: "asc" }),
  col("SABERMETRIC", "saber", "xfip", "xFIP", "FIP with a league-average home-run rate on fly balls", dec(2), { best: "asc" }),
  col("SABERMETRIC", "saber", "fipMinus", "FIP-", "FIP against the league — 100 is average, lower is better", dec(0), { best: "asc" }),
  col("SABERMETRIC", "saber", "eraMinus", "ERA-", "ERA against the league — 100 is average, lower is better", dec(0), { best: "asc" }),
  col("SABERMETRIC", "saber", "pli", "pLI", "Average leverage index on entering a game", dec(2)),
  col("SABERMETRIC", "saber", "gmli", "gmLI", "Average leverage index at the moment of entry", dec(2)),
  col("SABERMETRIC", "saber", "inli", "inLI", "Average leverage index over innings pitched", dec(2)),
  col("SABERMETRIC", "saber", "exli", "exLI", "Average leverage index on leaving a game", dec(2)),
  col("SABERMETRIC", "saber", "sd", "SD", "Shutdowns — relief outings that meaningfully helped the club win", whole),
  col("SABERMETRIC", "saber", "md", "MD", "Meltdowns — relief outings that meaningfully hurt it", whole, { best: "asc" }),
];

const EXPECTED_PITCHING: AdvCol[] = [
  col("EXPECTED", "x", "est_ba", "xBA", "Expected batting average allowed", rate, { best: "asc" }),
  col("EXPECTED", "x", "est_slg", "xSLG", "Expected slugging allowed", rate, { best: "asc" }),
  col("EXPECTED", "x", "est_woba", "xwOBA", "Expected weighted on-base average allowed", rate, { best: "asc" }),
  col("EXPECTED", "x", "xera", "xERA", "ERA implied by the contact allowed", dec(2), { best: "asc" }),
  col("EXPECTED", "x", "era_minus_xera_diff", "ERA∆", "Real ERA less the expected one", signed(2)),
];

const RATE_PITCHING: AdvCol[] = [
  col("PLATE", "adv", "babip", "BABIP", "Batting average on balls in play allowed", rate, { best: "asc" }),
  col("PLATE", "adv", "whiffPercentage", "WHF%", "Swings missed", pct()),
  col("PLATE", "adv", "strikePercentage", "STR%", "Pitches thrown for strikes", pct()),
  col("PLATE", "adv", "strikeoutsPer9", "K/9", "Strikeouts per nine innings", dec(2)),
  col("PLATE", "adv", "baseOnBallsPer9", "BB/9", "Walks per nine innings", dec(2), { best: "asc" }),
  col("PLATE", "adv", "homeRunsPer9", "HR/9", "Home runs per nine innings", dec(2), { best: "asc" }),
  col("PLATE", "adv", "hitsPer9", "H/9", "Hits per nine innings", dec(2), { best: "asc" }),
  col("PLATE", "adv", "strikesoutsToWalks", "K/BB", "Strikeouts per walk", dec(2)),
  col("PLATE", "adv", "strikeoutsMinusWalksPercentage", "K-BB%", "Strikeout rate less walk rate", pct()),
  col("PLATE", "adv", "flyBallPercentage", "FB%", "Share of batted balls hit in the air", pct()),
  col("PLATE", "adv", "gidpPercentage", "GIDP%", "Double plays per chance with a runner on first", pct()),
  col("PLATE", "adv", "pitchesPerInning", "P/IP", "Pitches thrown per inning", dec(2), { best: "asc" }),
  col("PLATE", "adv", "battersFacedPerGame", "BF/G", "Batters faced per appearance", dec(2)),
  col("PLATE", "adv", "runSupport", "RS", "Runs the club scored behind this pitcher", dec(0)),
  col("PLATE", "adv", "qualityStarts", "QS", "Starts of six innings or more on three earned runs or fewer", whole),
];

export const ADV_PITCHING_COLS: AdvCol[] = [
  ...SABER_PITCHING,
  ...EXPECTED_PITCHING,
  ...CONTACT("allowed"),
  ...RATE_PITCHING,
];

/* A club's board is the same line without the ones MLB only computes per
   player — a summed wRC+ or leverage index is not a team's season. */
const clubOnly = (cols: AdvCol[]) =>
  cols.filter(
    (c) =>
      c.src !== "saber" ||
      c.raw === "war" ||
      c.raw === "ra9War" ||
      c.raw === "rar",
  );

export const ADV_CLUB_BATTING_COLS = clubOnly(ADV_BATTING_COLS).filter(
  (c) => c.src !== "bat" || c.raw !== "swords",
);
export const ADV_CLUB_PITCHING_COLS = clubOnly(ADV_PITCHING_COLS).filter(
  (c) => c.src !== "x" || c.raw === "est_ba" || c.raw === "est_slg" || c.raw === "est_woba",
);

export const advCols = (view: AdvView): AdvCol[] =>
  view === "player-batting"
    ? ADV_BATTING_COLS
    : view === "player-pitching"
      ? ADV_PITCHING_COLS
      : view === "league-batting"
        ? ADV_CLUB_BATTING_COLS
        : ADV_CLUB_PITCHING_COLS;

/**
 * A column as the table needs it, and nothing more. `AdvCol` carries the
 * formatter that built the figure and the feed it came from — neither of
 * which survives the trip to a client component, since a function isn't
 * serialisable. Shipping the whole thing costs the board its server render.
 */
export interface ViewCol {
  key: string;
  label: string;
  title: string;
  group: string;
  best?: "asc";
}

const viewCol = (c: AdvCol): ViewCol => ({
  key: c.key,
  label: c.label,
  title: c.title,
  group: c.group,
  best: c.best,
});

/** Bands and their widths, for the header row that sits over the columns. */
export const colGroups = (
  cols: { group: string }[],
): { label: string; span: number }[] =>
  cols.reduce<{ label: string; span: number }[]>((bands, c) => {
    const last = bands[bands.length - 1];
    if (last?.label === c.group) last.span++;
    else bands.push({ label: c.group, span: 1 });
    return bands;
  }, []);

/* ── Boards ─────────────────────────────────────────────────────────── */

export interface AdvRow {
  /** Player id on a player board, club id on a club one. */
  id: number;
  name: string;
  /** A club's own row leaves these empty — it is the team. */
  team: string;
  teamId: number | null;
  position: string;
  values: Record<string, TeamStatValue>;
}

export interface AdvBoard {
  columns: ViewCol[];
  rows: AdvRow[];
  /** Which of the fetched sources came back empty — printed under the table. */
  missing: string[];
  note: string;
}

type Feeds = Record<string, Map<number, Record<string, Raw>>>;

const valuesOf = (cols: AdvCol[], feeds: Feeds, id: number) =>
  Object.fromEntries(
    cols.map((c) => [c.key, c.fmt(feeds[c.src]?.get(id)?.[c.raw])]),
  );

/**
 * Columns nothing on the board fills — bat tracking before 2023, a Savant
 * board gone quiet — dropped rather than printed as a run of dashes wide
 * enough to push the rest of the table off the screen.
 */
const filled = (cols: AdvCol[], rows: AdvRow[]): ViewCol[] =>
  (rows.length === 0
    ? cols
    : cols.filter((c) => rows.some((r) => r.values[c.key] !== null))
  ).map(viewCol);

/** Sources that answered with nothing — a Savant board gone quiet. */
const emptyFeeds = (cols: AdvCol[], feeds: Feeds) => {
  const label: Record<string, string> = {
    x: "expected statistics",
    ev: "exit velocity",
    bat: "bat tracking",
    saber: "sabermetrics",
  };
  return [...new Set(cols.map((c) => c.src))]
    .filter((s) => s !== "adv" && (feeds[s]?.size ?? 0) === 0)
    .map((s) => label[s] ?? s);
};

/** MLB's sabermetric line for everyone, by player id. */
async function saberFeed(
  season: number,
  group: "hitting" | "pitching",
): Promise<Map<number, Record<string, Raw>>> {
  const data = await mlb(
    `/stats?stats=sabermetrics&group=${group}&season=${season}` +
      `&sportId=1&gameType=R&playerPool=All&limit=2000`,
    3600,
  ).catch(() => null);
  const out = new Map<number, Record<string, Raw>>();
  for (const s of (data?.stats?.[0]?.splits ?? []) as any[])
    if (typeof s.player?.id === "number") out.set(s.player.id, s.stat ?? {});
  return out;
}

const SAVANT_YEAR = (season: number) => ({ year: String(season), min: "q" });

/*
 * The Savant boards a view joins on. Each spells its own `type`: the expected
 * and exit-velocity boards take "batter" / "batter-team", bat tracking takes
 * "batter" / "batting-team" — and keys its clubs by MLB id where the other
 * two key theirs by abbreviation. Bat tracking is a batting board only; the
 * pitching line here carries no swing columns to fill.
 */
const savantFeeds = (season: number, group: "hitting" | "pitching", club: boolean) => {
  const side = group === "hitting" ? "batter" : "pitcher";
  const type = club ? `${side}-team` : side;
  return Promise.all([
    orNone(savantCsv("expected_statistics", { ...SAVANT_YEAR(season), type })),
    orNone(savantCsv("statcast", { ...SAVANT_YEAR(season), type })),
    group === "pitching"
      ? Promise.resolve([] as Record<string, string>[])
      : orNone(
          savantCsv("bat-tracking", {
            ...SAVANT_YEAR(season),
            type: club ? "batting-team" : "batter",
          }),
        ),
  ]);
};

/**
 * One player board: MLB decides who is on it, Savant fills in what the ball
 * did. The spine is `seasonAdvanced` over MLB's own qualified pool, so the
 * board holds the same players the standard leader table does.
 */
async function playerBoard(
  season: number,
  group: "hitting" | "pitching",
): Promise<AdvBoard> {
  const [data, saber, [x, ev, bat]] = await Promise.all([
    mlb(
      `/stats?stats=seasonAdvanced&group=${group}&season=${season}&sportId=1` +
        `&gameType=R&playerPool=qualified&limit=1000&hydrate=team`,
      3600,
    ),
    saberFeed(season, group),
    savantFeeds(season, group, false),
  ]);

  const feeds: Feeds = {
    saber,
    x: byId(x, "player_id"),
    ev: byId(ev, "player_id"),
    bat: byId(bat, "id"),
  };
  const columns = advCols(
    group === "hitting" ? "player-batting" : "player-pitching",
  );

  const rows = ((data.stats?.[0]?.splits ?? []) as any[]).flatMap(
    (s): AdvRow[] => {
      const id = s.player?.id;
      if (typeof id !== "number") return [];
      return [
        {
          id,
          name: s.player?.fullName ?? "—",
          team: s.team?.abbreviation ?? "",
          teamId: s.team?.id ?? null,
          /* `seasonAdvanced` names the position on the split for a pitcher and
             on the player for everyone else. */
          position:
            s.position?.abbreviation ??
            s.player?.primaryPosition?.abbreviation ??
            "",
          /* The spine's own line is read straight off the split rather than
             through a map of one — it is already this row. */
          values: {
            ...valuesOf(columns, feeds, id),
            ...Object.fromEntries(
              columns
                .filter((c) => c.src === "adv")
                .map((c) => [c.key, c.fmt(s.stat?.[c.raw])]),
            ),
          },
        },
      ];
    },
  );

  return {
    columns: filled(columns, rows),
    rows,
    missing: emptyFeeds(columns, feeds),
    note:
      group === "hitting"
        ? "Qualified batters — 3.1 PA per club game. Bat tracking begins in 2023; every other tracked figure in 2015."
        : "Qualified pitchers — 1 IP per club game. Tracked figures begin in 2015.",
  };
}

/**
 * A club's sabermetric totals — the sum of what its players earned there.
 * The feed has no club line of its own, and only the figures that accumulate
 * are summed: a club's wRC+ is not the mean of thirty players'.
 *
 * A traded player carries one line at the club he finished the season at, so
 * nobody is counted twice.
 */
async function clubSaber(
  season: number,
  group: "hitting" | "pitching",
): Promise<Map<number, Record<string, Raw>>> {
  const data = await mlb(
    `/stats?stats=sabermetrics&group=${group}&season=${season}` +
      `&sportId=1&gameType=R&playerPool=All&limit=2000`,
    3600,
  ).catch(() => null);
  const out = new Map<number, Record<string, Raw>>();
  for (const s of (data?.stats?.[0]?.splits ?? []) as any[]) {
    const id = s.team?.id;
    if (typeof id !== "number") continue;
    const line = out.get(id) ?? {};
    for (const k of ["war", "ra9War", "rar"]) {
      const v = teamStatNum(s.stat?.[k]);
      if (v !== null) line[k] = (Number(line[k]) || 0) + v;
    }
    out.set(id, line);
  }
  return out;
}

/**
 * One club board. Savant keys its club CSVs by abbreviation rather than id,
 * so the thirty clubs are looked up once to bridge the two — a club Savant
 * spells differently loses its tracked columns and keeps the rest.
 */
async function clubBoard(
  season: number,
  group: "hitting" | "pitching",
): Promise<AdvBoard> {
  const [data, saber, clubs, [x, ev, bat]] = await Promise.all([
    mlb(
      `/teams/stats?stats=seasonAdvanced&group=${group}&season=${season}&sportId=1`,
      3600,
    ),
    clubSaber(season, group),
    getClubs().catch(() => []),
    savantFeeds(season, group, true),
  ]);

  const idOf = new Map(clubs.map((c) => [c.abbr, c.id]));
  /* Savant puts the abbreviation in `team_id` and the nickname in `team`. */
  const byClub = (rows: Record<string, string>[]) =>
    new Map(
      rows.flatMap((r) => {
        const id = idOf.get(r.team_id);
        return id ? ([[id, r]] as [number, typeof r][]) : [];
      }),
    );

  const feeds: Feeds = {
    saber,
    x: byClub(x),
    ev: byClub(ev),
    /* Bat tracking is the one club board Savant keys by MLB id already. */
    bat: byId(bat, "id"),
  };
  const columns = advCols(
    group === "hitting" ? "league-batting" : "league-pitching",
  );

  const rows = ((data.stats?.[0]?.splits ?? []) as any[]).flatMap(
    (s): AdvRow[] => {
      const id = s.team?.id;
      if (typeof id !== "number") return [];
      return [
        {
          id,
          name: s.team?.name ?? "—",
          team: "",
          teamId: id,
          position: "",
          values: {
            ...valuesOf(columns, feeds, id),
            ...Object.fromEntries(
              columns
                .filter((c) => c.src === "adv")
                .map((c) => [c.key, c.fmt(s.stat?.[c.raw])]),
            ),
          },
        },
      ];
    },
  );

  return {
    columns: filled(columns, rows),
    rows,
    missing: emptyFeeds(columns, feeds),
    note: "All thirty clubs. WAR is the sum of what a club's players earned there.",
  };
}

export const getAdvBoard = (view: AdvView, season: number): Promise<AdvBoard> =>
  view === "player-batting"
    ? playerBoard(season, "hitting")
    : view === "player-pitching"
      ? playerBoard(season, "pitching")
      : view === "league-batting"
        ? clubBoard(season, "hitting")
        : clubBoard(season, "pitching");

/* ── Top performers ─────────────────────────────────────────────────── */

/** Rows a leader card carries — the rest of the column is the board itself. */
export const TOP_SHOWN = 5;

export interface TopLeader {
  rank: number;
  id: number;
  name: string;
  team: string;
  teamId: number | null;
  value: string;
}

export interface TopCard {
  key: string;
  /** "BATTING", "PITCHING", "FIELDING", "CATCHER" — the card's own prefix. */
  group: string;
  label: string;
  title: string;
  /** The board this column lives on, where one of ours carries it. */
  href: string | null;
  leaders: TopLeader[];
}

/** Best first: the good end of the column, which is not always the high one. */
const topOf = (
  rows: { id: number; name: string; team: string; teamId: number | null; value: TeamStatValue }[],
  dir: "asc" | "desc",
  unit: string,
): TopLeader[] => {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .flatMap((r) => {
      const n = teamStatNum(r.value);
      return n === null ? [] : [{ ...r, n }];
    })
    .sort((a, b) => (a.n - b.n) * sign)
    .slice(0, TOP_SHOWN)
    .map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      team: r.team,
      teamId: r.teamId,
      value: `${r.value}${unit}`,
    }));
};

/** Which columns of the two player boards get a card, and which way they run. */
const TOP_COLUMNS: Record<"player-batting" | "player-pitching", [string, "asc" | "desc"][]> = {
  "player-batting": [
    ["saber.war", "desc"],
    ["saber.wRcPlus", "desc"],
    ["saber.woba", "desc"],
    ["x.est_woba", "desc"],
    ["x.est_slg", "desc"],
    ["x.est_ba", "desc"],
    ["ev.avg_hit_speed", "desc"],
    ["ev.ev95percent", "desc"],
    ["ev.brl_pa", "desc"],
    ["ev.anglesweetspotpercent", "desc"],
    ["ev.max_hit_speed", "desc"],
    ["bat.avg_bat_speed", "desc"],
    ["bat.squared_up_per_swing", "desc"],
    ["bat.blast_per_swing", "desc"],
    ["bat.whiff_per_swing", "asc"],
    ["adv.iso", "desc"],
    ["adv.walksPerPlateAppearance", "desc"],
    ["adv.strikeoutsPerPlateAppearance", "asc"],
  ],
  "player-pitching": [
    ["saber.war", "desc"],
    ["saber.fip", "asc"],
    ["saber.xfip", "asc"],
    ["saber.eraMinus", "asc"],
    ["x.est_woba", "asc"],
    ["x.xera", "asc"],
    ["adv.whiffPercentage", "desc"],
    ["adv.strikeoutsMinusWalksPercentage", "desc"],
    ["adv.strikeoutsPer9", "desc"],
    ["adv.babip", "asc"],
    ["ev.avg_hit_speed", "asc"],
    ["ev.brl_percent", "asc"],
  ],
};

/** The cards a player board contributes, off rows already fetched. */
const boardCards = (
  view: "player-batting" | "player-pitching",
  board: AdvBoard,
  season: number,
): TopCard[] => {
  const group = view === "player-batting" ? "BATTING" : "PITCHING";
  /* The board's own columns are the stripped ones — the unit a card prints
     lives on the full definition. A column the board dropped for want of
     data gets no card either. */
  const shown = new Set(board.columns.map((c) => c.key));
  const byKey = new Map(
    advCols(view)
      .filter((c) => shown.has(c.key))
      .map((c) => [c.key, c]),
  );
  return TOP_COLUMNS[view].flatMap((entry): TopCard[] => {
    const [key, dir] = entry;
    const c = byKey.get(key);
    if (!c) return [];
    const leaders = topOf(
      board.rows.map((r) => ({
        id: r.id,
        name: r.name,
        team: r.team,
        teamId: r.teamId,
        value: r.values[key],
      })),
      dir,
      c.unit ?? "",
    );
    return leaders.length
      ? [
          {
            key: `${view}.${key}`,
            group,
            label: c.label,
            title: c.title,
            href: `/stats/${view}?season=${season}&sort=${encodeURIComponent(key)}`,
            leaders,
          },
        ]
      : [];
  });
};

/*
 * The fielding cards, which have no board of their own here — MLB's Stats API
 * publishes no fielding sabermetrics at all, so every one of these is a
 * Savant leaderboard read for one column. Same shape as the batting and
 * pitching cards, so the grid doesn't know the difference.
 */
interface FieldSpec {
  key: string;
  group: string;
  label: string;
  title: string;
  board: string;
  params: (season: number) => Record<string, string>;
  idKey: string;
  nameKey: string;
  /** Numeric MLB club id, where the board carries one. */
  teamKey?: string;
  valueKey: string;
  fmt: (v: Raw) => TeamStatValue;
  unit?: string;
  dir: "asc" | "desc";
}

const OAA_PARAMS = (season: number) => ({
  type: "Fielder",
  startYear: String(season),
  endYear: String(season),
  split: "no",
  team: "",
  range: "year",
  min: "q",
  pos: "",
  roles: "",
  viz: "hide",
});

const FIELD_SPECS: FieldSpec[] = [
  {
    key: "oaa",
    group: "FIELDING",
    label: "OUTS ABOVE AVERAGE",
    title: "Outs made beyond what an average fielder makes on the same chances",
    board: "outs_above_average",
    params: OAA_PARAMS,
    idKey: "player_id",
    nameKey: "last_name, first_name",
    valueKey: "outs_above_average",
    fmt: signed(0),
    dir: "desc",
  },
  {
    key: "frp",
    group: "FIELDING",
    label: "RUNS PREVENTED",
    title: "Outs above average converted to the runs they saved",
    board: "outs_above_average",
    params: OAA_PARAMS,
    idKey: "player_id",
    nameKey: "last_name, first_name",
    valueKey: "fielding_runs_prevented",
    fmt: signed(0),
    dir: "desc",
  },
  {
    key: "arm",
    group: "FIELDING",
    label: "ARM STRENGTH",
    title: "Average of a fielder's hardest throws",
    board: "arm-strength",
    params: (season) => ({
      type: "player",
      year: String(season),
      minThrows: "50",
      pos: "",
      team: "",
    }),
    idKey: "player_id",
    nameKey: "fielder_name",
    valueKey: "arm_overall",
    fmt: dec(1),
    unit: " MPH",
    dir: "desc",
  },
  {
    key: "maxarm",
    group: "FIELDING",
    label: "HARDEST THROW",
    title: "The single hardest throw of the season",
    board: "arm-strength",
    params: (season) => ({
      type: "player",
      year: String(season),
      minThrows: "50",
      pos: "",
      team: "",
    }),
    idKey: "player_id",
    nameKey: "fielder_name",
    valueKey: "max_arm_strength",
    fmt: dec(1),
    unit: " MPH",
    dir: "desc",
  },
  {
    key: "poptime",
    group: "CATCHER",
    label: "POP TIME — 2B",
    title: "Catch to the glove at second base, in seconds — lower is better",
    board: "poptime",
    params: (season) => ({
      year: String(season),
      team: "",
      min2b: "5",
      min3b: "0",
    }),
    idKey: "entity_id",
    nameKey: "entity_name",
    teamKey: "team_id",
    valueKey: "pop_2b_sba",
    fmt: dec(2),
    unit: " SEC",
    dir: "asc",
  },
  {
    key: "framing",
    group: "CATCHER",
    label: "FRAMING RUNS",
    title: "Runs saved by turning borderline pitches into strikes",
    board: "catcher-framing",
    params: (season) => ({
      year: String(season),
      team: "",
      min: "q",
      type: "catcher",
    }),
    idKey: "id",
    nameKey: "name",
    valueKey: "rv_tot",
    fmt: signed(0),
    dir: "desc",
  },
  {
    key: "strikerate",
    group: "CATCHER",
    label: "STRIKE RATE",
    title: "Share of pitches on the edge of the zone called strikes",
    board: "catcher-framing",
    params: (season) => ({
      year: String(season),
      team: "",
      min: "q",
      type: "catcher",
    }),
    idKey: "id",
    nameKey: "name",
    valueKey: "pct_tot",
    fmt: pct(),
    unit: "%",
    dir: "desc",
  },
];

/**
 * The fielding cards. Several specs share a board — outs above average feeds
 * two of them — so each distinct request is made once and read twice.
 */
async function fieldCards(season: number): Promise<TopCard[]> {
  const fetched = new Map<string, Promise<Record<string, string>[]>>();
  const rowsFor = (spec: FieldSpec) => {
    const params = spec.params(season);
    const key = `${spec.board}?${new URLSearchParams(params)}`;
    const hit = fetched.get(key) ?? orNone(savantCsv(spec.board, params));
    fetched.set(key, hit);
    return hit;
  };

  return (
    await Promise.all(
      FIELD_SPECS.map(async (spec): Promise<TopCard[]> => {
        const rows = await rowsFor(spec);
        const leaders = topOf(
          rows.map((r) => ({
            id: Number(r[spec.idKey]) || 0,
            name: flipName(r[spec.nameKey] ?? ""),
            team: "",
            teamId: spec.teamKey ? Number(r[spec.teamKey]) || null : null,
            value: spec.fmt(r[spec.valueKey]),
          })),
          spec.dir,
          spec.unit ?? "",
        );
        return leaders.length
          ? [
              {
                key: spec.key,
                group: spec.group,
                label: spec.label,
                title: spec.title,
                /* No board of ours carries these — the card is the whole
                   view, so it links nowhere rather than to a dead column. */
                href: null,
                leaders,
              },
            ]
          : [];
      }),
    )
  ).flat();
}

/** Every leader card on the top-performers page, in the order it fills. */
export async function getTopPerformers(season: number): Promise<TopCard[]> {
  const [batting, pitching, fielding] = await Promise.all([
    playerBoard(season, "hitting"),
    playerBoard(season, "pitching"),
    fieldCards(season),
  ]);
  return [
    ...boardCards("player-batting", batting, season),
    ...boardCards("player-pitching", pitching, season),
    ...fielding,
  ];
}
