import type { Metadata } from "next";
import ParamTabs from "@/components/mlb/ParamTabs";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ComparePicker from "@/components/mlb/ComparePicker";
import {
  CompareHeadline,
  CompareSection,
  CompareStatPicker,
  CompareTable,
  type CompareEntity,
  type HeadlineStat,
  type StatSection,
} from "@/components/mlb/ComparePanels";
import {
  EMPTY_CAREER,
  advancedCols,
  careerCols,
  getPlayer,
  getPlayerCareer,
  getPlayerAwards,
  getPlayerGroups,
  playerHeadshot,
  seasonOf,
  teamStatNum,
  todayPT,
  wholeSeasonRow,
  type CareerTable,
  type PlayerAward,
  type PlayerSummary,
  type StatGroup,
  type TeamStatCol,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * Up to four players, side by side — a hand-picked headline over a full
 * career or stat line's worth of table, either one column of each on the
 * career total or on a single shared season. Reached from the league bar,
 * and directly with `?ids=`.
 *
 * Everything the controls touch lives in the URL, the same as the rest of
 * the site — `ids`, `group`, `scope`, `season`, `stats` — so a comparison is
 * a link, not a session.
 */

export const metadata: Metadata = { title: "Compare Players" };

const MAX = 4;
const GROUP_ORDER: StatGroup[] = ["hitting", "pitching", "fielding"];

/* The headline's default figures per group — the main line. Anything else
   the page can compare is one pick away in the stat dropdown. */
const HEADLINE: Record<StatGroup, string[]> = {
  hitting: ["war", "gamesPlayed", "plateAppearances", "hits", "homeRuns", "rbi", "stolenBases", "avg", "obp", "slg", "ops", "opsPlus"],
  pitching: ["war", "wins", "losses", "era", "whip", "gamesPlayed", "gamesStarted", "saves", "inningsPitched", "strikeOuts", "baseOnBalls", "eraPlus"],
  fielding: ["games", "putOuts", "assists", "errors", "doublePlays", "fielding"],
};

/* Where a lower figure is the better one. The headline marks the leader of
   whatever is picked, so it has to know which way each figure runs. */
const LOW: Record<StatGroup, Set<string>> = {
  hitting: new Set(["strikeOuts", "caughtStealing", "groundIntoDoublePlay", "kPct", "abPerHr"]),
  pitching: new Set([
    "losses", "era", "hits", "runs", "earnedRuns", "homeRuns", "baseOnBalls", "intentionalWalks",
    "hitBatsmen", "balks", "wildPitches", "whip", "fip", "xfip", "fipMinus", "eraMinus",
    "hitsPer9Inn", "homeRunsPer9", "walksPer9Inn", "babip", "bbPct", "md",
  ]),
  fielding: new Set(["errors"]),
};

/* Award counts, AL and NL together. A season comparison counts that year's. */
const AWARD_STATS = [
  { key: "allStar", label: "All-Star", ids: ["ALAS", "NLAS"] },
  { key: "mvp", label: "MVP", ids: ["ALMVP", "NLMVP"] },
  { key: "cy", label: "Cy Young", ids: ["ALCY", "NLCY"] },
  { key: "roy", label: "ROY", ids: ["ALROY", "NLROY"] },
  { key: "ss", label: "Silver Slugger", ids: ["ALSS", "NLSS"] },
  { key: "gg", label: "Gold Glove", ids: ["ALGG", "NLGG"] },
  { key: "pg", label: "Platinum Glove", ids: ["ALPG", "NLPG"] },
  { key: "allMlb1", label: "All-MLB 1st", ids: ["MLBAFIRST"] },
  { key: "allMlb2", label: "All-MLB 2nd", ids: ["MLBSECOND"] },
  { key: "ws", label: "WS Champion", ids: ["WSCHAMP"] },
  { key: "wsMvp", label: "WS MVP", ids: ["WSMVP"] },
];

const GROUP_TITLE: Record<StatGroup, string> = {
  hitting: "Batting",
  pitching: "Pitching",
  fielding: "Fielding",
};

/* ── The sections under the stats table ──────────────────────────────── */

/* Baseball-Reference's comparison layout: who and when, then one block of
   value figures and one of sabermetric ones. Its fourth block, win
   probability, has no feed behind it here — MLB serves no WPA or RE24. */
const DERIVED_COLS: TeamStatCol[] = [
  { key: "age", label: "Age", title: "Age — now on a career line, that season's on one year" },
  { key: "from", label: "From", title: "First season on the line" },
  { key: "to", label: "To", title: "Last season on the line" },
  { key: "xbh", label: "XBH", title: "Extra-base hits" },
  { key: "tob", label: "TOB", title: "Times on base — hits, walks and hit-by-pitches" },
  { key: "iso", label: "ISO", title: "Isolated power — slugging less batting average" },
  { key: "babip", label: "BAbip", title: "Batting average on balls in play" },
  { key: "kPct", label: "SO%", title: "Strikeouts per plate appearance" },
  { key: "bbPct", label: "BB%", title: "Walks per plate appearance" },
  { key: "kMinusBb", label: "SO-BB%", title: "Strikeout rate less walk rate" },
  { key: "abPerSo", label: "AB/SO", title: "At-bats per strikeout" },
  { key: "abPerHr", label: "AB/HR", title: "At-bats per home run" },
  { key: "sbPct", label: "SB%", title: "Stolen-base success rate" },
];

const SECTION_KEYS: Record<"hitting" | "pitching", { value: string[]; saber: string[] }> = {
  hitting: {
    value: ["war", "rar", "wRaa", "batting", "baseRunning", "positional", "replacement", "ubr", "wSb", "wGdp"],
    saber: ["xbh", "tob", "iso", "babip", "kPct", "bbPct", "abPerSo", "abPerHr", "sbPct", "woba", "wRc", "wRcPlus", "spd"],
  },
  pitching: {
    value: ["war", "ra9War", "rar"],
    saber: ["fip", "xfip", "fipMinus", "eraMinus", "babip", "kPct", "bbPct", "kMinusBb", "pli", "gmli", "sd", "md"],
  },
};

/** Who and when, ahead of every section — BR's Age / From / To / G / PA. */
const LEAD_KEYS = {
  hitting: ["age", "from", "to", "gamesPlayed", "plateAppearances"],
  pitching: ["age", "from", "to", "gamesPlayed", "inningsPitched"],
};

function colsOf(group: StatGroup, keys: string[]): TeamStatCol[] {
  const all = [...DERIVED_COLS, ...careerCols(group), ...advancedCols(group)];
  return keys.map((k) => all.find((c) => c.key === k)!);
}

const sectionCols = (group: "hitting" | "pitching", keys: string[]) =>
  colsOf(group, [...LEAD_KEYS[group], ...keys]);

/** One player's line in one group — career or the picked season — with the
 *  derived figures and the who-and-when columns on it. */
function lineOf(
  group: StatGroup,
  career: CareerTable,
  p: PlayerSummary,
  scope: "career" | "season",
  season: number
): Record<string, TeamStatValue> | null {
  const row = scope === "season" ? wholeSeasonRow(career, season) : null;
  const base = scope === "career" ? career.total : (row?.values ?? null);
  if (!base) return null;
  const years = career.rows.map((r) => Number(r.season)).filter(Boolean);
  return {
    ...base,
    ...(group === "fielding" ? {} : derive(group, base)),
    age: scope === "career" ? p.age : (row?.age ?? null),
    /* Strings, so a year isn't printed with a thousands comma. */
    from: String(scope === "career" ? Math.min(...years) : season),
    to: String(scope === "career" ? Math.max(...years) : season),
  };
}

const rate3 = (a: number, b: number) =>
  b > 0 ? (a / b).toFixed(3).replace(/^(-?)0\./, "$1.") : null;
const pct = (a: number, b: number) => (b > 0 ? ((100 * a) / b).toFixed(1) : null);
const per = (a: number, b: number) => (b > 0 ? (a / b).toFixed(1) : null);

/** The sabermetric figures that are plain arithmetic on the counting line —
 *  worked out here rather than fetched, so a career line gets them too. */
function derive(group: StatGroup, v: Record<string, TeamStatValue>): Record<string, TeamStatValue> {
  const n = (k: string) => teamStatNum(v[k] ?? null) ?? 0;
  const babip = rate3(
    n("hits") - n("homeRuns"),
    n("atBats") - n("strikeOuts") - n("homeRuns") + n("sacFlies")
  );
  if (group === "pitching") {
    const bf = n("battersFaced");
    return {
      babip,
      kPct: pct(n("strikeOuts"), bf),
      bbPct: pct(n("baseOnBalls"), bf),
      kMinusBb: pct(n("strikeOuts") - n("baseOnBalls"), bf),
    };
  }
  const pa = n("plateAppearances");
  return {
    xbh: n("doubles") + n("triples") + n("homeRuns"),
    tob: n("hits") + n("baseOnBalls") + n("hitByPitch"),
    iso: rate3(n("totalBases") - n("hits"), n("atBats")),
    babip,
    kPct: pct(n("strikeOuts"), pa),
    bbPct: pct(n("baseOnBalls"), pa),
    abPerSo: per(n("atBats"), n("strikeOuts")),
    abPerHr: per(n("atBats"), n("homeRuns")),
    sbPct: pct(n("stolenBases"), n("stolenBases") + n("caughtStealing")),
  };
}

function parseIds(raw: string | undefined): number[] {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, MAX);
}

/* Same rule the player page picks a season by: whatever `?season=` names, as
   long as it's a season at least one compared player actually has. */
function pickSeason(raw: string | undefined, seasons: number[], current: number): number {
  const n = Number(raw);
  if (Number.isInteger(n) && seasons.includes(n)) return n;
  return seasons[0] ?? current;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string;
    scope?: string;
    season?: string;
    stats?: string;
    h?: string;
  }>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const ids = parseIds(sp.ids);

  const fetched = await Promise.all(ids.map((id) => getPlayer(id, current).catch(() => null)));
  const players = fetched.filter((p): p is PlayerSummary => p !== null);

  const groupsByPlayer = await Promise.all(
    players.map((p) =>
      getPlayerGroups(p.id, p.pos).catch((): StatGroup[] => ["hitting", "fielding"])
    )
  );
  const availableGroups = GROUP_ORDER.filter((g) => groupsByPlayer.some((gs) => gs.includes(g)));
  /* The main line is batting unless every player is a pitcher; the other
     groups are still there, one pick away in the stat dropdown. */
  const group: StatGroup = availableGroups[0] ?? "hitting";

  const [careerLists, awards] = await Promise.all([
    Promise.all(
      availableGroups.map((g) =>
        Promise.all(players.map((p) => getPlayerCareer(p.id, g).catch(() => EMPTY_CAREER)))
      )
    ),
    Promise.all(players.map((p) => getPlayerAwards(p.id).catch((): PlayerAward[] => []))),
  ]);
  const careersOf = (g: StatGroup) =>
    careerLists[availableGroups.indexOf(g)] ?? players.map(() => EMPTY_CAREER);

  const scope = sp.scope === "season" ? "season" : "career";
  const allSeasons = [
    ...new Set(careerLists.flat().flatMap((c) => c.rows.map((r) => Number(r.season)))),
  ].sort((a, b) => b - a);
  const season = pickSeason(sp.season, allSeasons, current);

  /* The tables below read the main group's line under its own keys; the
     headline reads every group at once, so its keys carry the group. */
  const values: Record<number, Record<string, TeamStatValue> | null> = {};
  const picked: Record<number, Record<string, TeamStatValue> | null> = {};
  players.forEach((p, i) => {
    values[p.id] = lineOf(group, careersOf(group)[i], p, scope, season);
    const out: Record<string, TeamStatValue> = {};
    for (const g of availableGroups) {
      const line = lineOf(g, careersOf(g)[i], p, scope, season);
      for (const [k, v] of Object.entries(line ?? {})) out[`${g}:${k}`] = v;
    }
    const won = awards[i].filter((a) => scope === "career" || a.season === String(season));
    for (const a of AWARD_STATS) out[`awards:${a.key}`] = won.filter((w) => a.ids.includes(w.id)).length;
    picked[p.id] = out;
  });

  /* Everything the headline can compare, in the dropdown's sections. A figure
     from outside the main group says which group it is — "H (P)" is hits
     allowed, not hits. */
  const tag = (g: StatGroup) => (g === group ? "" : ` (${GROUP_TITLE[g][0]})`);
  const opt = (g: StatGroup, c: TeamStatCol): HeadlineStat => ({
    key: `${g}:${c.key}`,
    label: c.label + tag(g),
    name: c.label,
    title: c.title,
    low: LOW[g].has(c.key),
  });
  const bp = availableGroups.filter((g): g is "hitting" | "pitching" => g !== "fielding");
  const sub = (g: StatGroup) => (bp.length > 1 ? ` · ${GROUP_TITLE[g]}` : "");
  const sections: StatSection[] = [
    ...availableGroups.map((g) => ({ title: GROUP_TITLE[g], stats: careerCols(g).map((c) => opt(g, c)) })),
    ...bp.map((g) => ({
      title: `Sabermetrics${sub(g)}`,
      stats: colsOf(g, SECTION_KEYS[g].saber).map((c) => opt(g, c)),
    })),
    ...bp.map((g) => ({
      title: `Value${sub(g)}`,
      stats: colsOf(g, SECTION_KEYS[g].value).map((c) => opt(g, c)),
    })),
    {
      title: "Awards",
      stats: AWARD_STATS.map((a) => ({ key: `awards:${a.key}`, label: a.label, title: a.label })),
    },
  ];
  const byKey = new Map(sections.flatMap((sec) => sec.stats.map((st) => [st.key, st])));
  const defaults = HEADLINE[group].map((k) => `${group}:${k}`);
  const chosen = (sp.h ? sp.h.split(",") : defaults).filter((k) => byKey.has(k));
  const headline = (chosen.length ? chosen : defaults).map((k) => byKey.get(k)!).filter(Boolean);

  const entities: CompareEntity[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    image: playerHeadshot(p.id, 120),
    href: `/player/${p.id}`,
  }));
  const slots = entities;
  const selectedStats = sp.stats ? sp.stats.split(",").filter(Boolean) : [];

  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold tracking-wider text-ink">COMPARE PLAYERS</h1>
        {/* Up top so the scope is set before anyone is picked. The season tab
            reads as the year it shows — the current one unless changed. */}
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <ParamTabs
            param="scope"
            ariaLabel="Career or season"
            value={scope}
            options={[
              { value: "career", label: "CAREER" },
              { value: "season", label: String(season) },
            ]}
          />
          {scope === "season" && allSeasons.length > 1 && (
            <SeasonSelect value={season} seasons={allSeasons} />
          )}
        </span>
      </div>

      <ComparePicker kind="player" slots={slots} max={MAX} />

      {players.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          ADD UP TO {MAX} PLAYERS TO COMPARE
        </p>
      ) : (
        <>
          <CompareStatPicker
            sections={sections}
            selected={headline.map((st) => st.key)}
            defaults={defaults}
          />
          <CompareHeadline entities={entities} stats={headline} values={picked} />
          <CompareTable
            columns={careerCols(group)}
            selected={selectedStats}
            entities={entities}
            values={values}
          />
          {group !== "fielding" && (
            <>
              <CompareSection
                title="Value"
                columns={sectionCols(group, SECTION_KEYS[group].value)}
                entities={entities}
                values={values}
              />
              <CompareSection
                title="Sabermetric"
                columns={sectionCols(group, SECTION_KEYS[group].saber)}
                entities={entities}
                values={values}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
