import type { Metadata } from "next";
import Link from "next/link";
import ParamTabs from "@/components/mlb/ParamTabs";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ComparePicker from "@/components/mlb/ComparePicker";
import {
  CompareHeadline,
  CompareTable,
  type CompareEntity,
  type HeadlineStat,
} from "@/components/mlb/ComparePanels";
import {
  EMPTY_CAREER,
  advancedCols,
  careerCols,
  getPlayer,
  getPlayerCareer,
  getPlayerGroups,
  groupOptions,
  pickPlayerGroup,
  playerHeadshot,
  seasonOf,
  todayET,
  wholeSeasonRow,
  type PlayerSummary,
  type StatGroup,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * Up to four players, side by side — a hand-picked headline over a full
 * career or stat line's worth of table, either one column of each on the
 * career total or on a single shared season. Reached from every player
 * page's COMPARE button, and from here directly with `?ids=`.
 *
 * Everything the controls touch lives in the URL, the same as the rest of
 * the site — `ids`, `group`, `scope`, `season`, `stats` — so a comparison is
 * a link, not a session.
 */

export const metadata: Metadata = { title: "COMPARE PLAYERS — STAT//SIGHTLINE" };

const MAX = 4;
const GROUP_ORDER: StatGroup[] = ["hitting", "pitching", "fielding"];

/* The headline figures per group — a short, hand-picked list rather than the
   whole column set, since only a known direction (higher or lower is better)
   can be highlighted safely. Mirrors the fuller CAREER_*_COLS in lib/mlb. */
const HEADLINE: Record<StatGroup, HeadlineStat[]> = {
  hitting: [
    { key: "war", label: "WAR" },
    { key: "gamesPlayed", label: "G" },
    { key: "plateAppearances", label: "PA" },
    { key: "hits", label: "H" },
    { key: "homeRuns", label: "HR" },
    { key: "rbi", label: "RBI" },
    { key: "stolenBases", label: "SB" },
    { key: "avg", label: "BA" },
    { key: "obp", label: "OBP" },
    { key: "slg", label: "SLG" },
    { key: "ops", label: "OPS" },
    { key: "opsPlus", label: "OPS+" },
  ],
  pitching: [
    { key: "war", label: "WAR" },
    { key: "wins", label: "W" },
    { key: "losses", label: "L", low: true },
    { key: "era", label: "ERA", low: true },
    { key: "whip", label: "WHIP", low: true },
    { key: "gamesPlayed", label: "G" },
    { key: "gamesStarted", label: "GS" },
    { key: "saves", label: "SV" },
    { key: "inningsPitched", label: "IP" },
    { key: "strikeOuts", label: "SO" },
    { key: "baseOnBalls", label: "BB", low: true },
    { key: "eraPlus", label: "ERA+" },
  ],
  fielding: [
    { key: "games", label: "G" },
    { key: "putOuts", label: "PO" },
    { key: "assists", label: "A" },
    { key: "errors", label: "E", low: true },
    { key: "doublePlays", label: "DP" },
    { key: "fielding", label: "FPCT" },
  ],
};

/* The advanced view's own headline. On a career line the rates here read "—"
   — see getPlayerCareer on why a wRC+ cannot be added up. */
const ADV_HEADLINE: Record<StatGroup, HeadlineStat[]> = {
  hitting: [
    { key: "war", label: "WAR" },
    { key: "rar", label: "RAR" },
    { key: "woba", label: "wOBA" },
    { key: "wRcPlus", label: "wRC+" },
    { key: "wRaa", label: "wRAA" },
    { key: "batting", label: "Rbat" },
    { key: "baseRunning", label: "Rbaser" },
  ],
  pitching: [
    { key: "war", label: "WAR" },
    { key: "ra9War", label: "RA9-WAR" },
    { key: "rar", label: "RAR" },
    { key: "fip", label: "FIP", low: true },
    { key: "xfip", label: "xFIP", low: true },
    { key: "fipMinus", label: "FIP-", low: true },
    { key: "eraMinus", label: "ERA-", low: true },
  ],
  fielding: [],
};

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
    group?: string;
    scope?: string;
    season?: string;
    stats?: string;
    adv?: string;
  }>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayET());
  const ids = parseIds(sp.ids);

  const fetched = await Promise.all(ids.map((id) => getPlayer(id, current).catch(() => null)));
  const players = fetched.filter((p): p is PlayerSummary => p !== null);

  const groupsByPlayer = await Promise.all(
    players.map((p) =>
      getPlayerGroups(p.id, p.pos).catch((): StatGroup[] => ["hitting", "fielding"])
    )
  );
  const availableGroups = GROUP_ORDER.filter((g) => groupsByPlayer.some((gs) => gs.includes(g)));
  const group = availableGroups.length
    ? pickPlayerGroup(sp.group, availableGroups)
    : "hitting";

  const careers = await Promise.all(
    players.map((p) => getPlayerCareer(p.id, group).catch(() => EMPTY_CAREER))
  );

  const scope = sp.scope === "season" ? "season" : "career";
  const allSeasons = [
    ...new Set(careers.flatMap((c) => c.rows.map((r) => Number(r.season)))),
  ].sort((a, b) => b - a);
  const season = pickSeason(sp.season, allSeasons, current);

  const values: Record<number, Record<string, TeamStatValue> | null> = {};
  players.forEach((p, i) => {
    values[p.id] =
      scope === "career" ? careers[i].total : (wholeSeasonRow(careers[i], season)?.values ?? null);
  });

  const entities: CompareEntity[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    image: playerHeadshot(p.id, 120),
    href: `/player/${p.id}`,
  }));
  const slots = entities;
  const selectedStats = sp.stats ? sp.stats.split(",").filter(Boolean) : [];
  /* There is no advanced fielding line to switch to, so that tab never offers
     the toggle — and a URL asking for one anyway reads as the standard view. */
  const hasAdvanced = advancedCols(group).length > 0;
  const advanced = hasAdvanced && sp.adv === "1";

  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-bold tracking-wider text-ink">COMPARE PLAYERS</h1>
        <Link
          href="/compare/teams"
          className="text-[10px] tracking-[0.2em] text-ink-3 hover:text-accent"
        >
          COMPARE TEAMS →
        </Link>
      </div>

      <ComparePicker kind="player" slots={slots} max={MAX} />

      {players.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          ADD UP TO {MAX} PLAYERS TO COMPARE
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-3 py-2">
            {availableGroups.length > 1 && (
              <ParamTabs
                param="group"
                ariaLabel="Stat group"
                value={group}
                options={groupOptions(availableGroups)}
              />
            )}
            {hasAdvanced && (
              <ParamTabs
                param="adv"
                ariaLabel="Standard or advanced stats"
                value={advanced ? "1" : "0"}
                options={[
                  { value: "0", label: "STANDARD" },
                  { value: "1", label: "ADVANCED" },
                ]}
              />
            )}
            <span className="ml-auto flex flex-wrap items-center gap-3">
              <ParamTabs
                param="scope"
                ariaLabel="Career or season"
                value={scope}
                options={[
                  { value: "career", label: "CAREER" },
                  { value: "season", label: "SEASON" },
                ]}
              />
              {scope === "season" && (
                <SeasonSelect value={season} seasons={allSeasons.length ? allSeasons : [current]} />
              )}
            </span>
          </div>

          <CompareHeadline
            entities={entities}
            stats={advanced ? ADV_HEADLINE[group] : HEADLINE[group]}
            values={values}
          />
          <CompareTable
            columns={advanced ? advancedCols(group) : careerCols(group)}
            selected={selectedStats}
            entities={entities}
            values={values}
          />
        </>
      )}
    </div>
  );
}
