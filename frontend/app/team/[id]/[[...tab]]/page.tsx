import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import {
  Skeleton,
  SkeletonPanel,
  SkeletonTiles,
} from "@/components/ui/Skeleton";
import TeamTabs, { isTeamTab, type TeamTab } from "@/components/mlb/TeamTabs";
import TeamHome from "@/components/mlb/TeamHome";
import PlayerStatTables from "@/components/mlb/PlayerStatTables";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ParamSelect from "@/components/mlb/ParamSelect";
import {
  SchedulePanel,
  SplitsPanels,
  RosterPanel,
  InjuriesPanel,
  TransactionsPanel,
} from "@/components/mlb/TeamPanels";
import {
  getBreakDate,
  breakIndex,
  getPitcherRecords,
  getTeamIdentity,
  getTeamInjuries,
  getTeamPlayerStats,
  getTeamRosterGroups,
  getTeamSchedule,
  getTeamSplits,
  getTeamTransactions,
  getTeamLines,
  getTeamRecord,
  pickPlayerGameType,
  playerCols,
  seasonOf,
  teamIdOf,
  FIRST_SEASON,
  PLAYER_GAME_TYPES,
  type Game,
  type PitcherRecord,
  type PlayerGameType,
  type StatGroup,
  teamLogo,
  teamStatText,
  todayET,
  TEAM_HITTING_COLS,
  TEAM_PITCHING_COLS,
  type StandingRow,
  type TeamIdentity,
  type TeamStatCol,
  type TeamStatRow,
} from "@/lib/mlb";

/*
 * One club's season page — the target of every TeamLink, reached from the
 * team-statistics section and from any standings row. An identity bar and a
 * tab strip over one section at a time: the home summary, then the schedule,
 * season lines, roster, splits, injury list and transactions.
 *
 * The tabs are segments of this one optional catch-all route rather than
 * files of their own, so identity and chrome are fetched and written once and
 * each tab pays only for its own payload.
 *
 * Only identity is awaited before rendering; the body streams in behind a
 * skeleton, so the page has shape immediately and a slow roster never holds
 * back the header. That also keeps the 404 honest — see lib/mlb's note on
 * getTeamIdentity. A dead MLB API degrades to a notice inside the tab rather
 * than blanking the page.
 */

/** The four stats each group leads with, as MetricCards. */
const HEADLINE: Record<"hitting" | "pitching", string[]> = {
  hitting: ["avg", "homeRuns", "runs", "ops"],
  pitching: ["era", "whip", "strikeOuts", "saves"],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTeamIdentity(teamIdOf(id), seasonOf(todayET())).catch(
    () => null
  );
  return { title: t ? `${t.name} — STAT//SIGHTLINE` : "STAT//SIGHTLINE" };
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what} UNAVAILABLE — MLB API UNREACHABLE
    </p>
  );
}

function Identity({ t, season }: { t: TeamIdentity; season: number }) {
  const facts = [
    t.division,
    t.league,
    t.venue.toUpperCase(),
    t.firstYear && `EST ${t.firstYear}`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(t.id)}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0"
      />
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-wider text-ink">
          {t.name.toUpperCase()}
        </h1>
        <p className="mt-1 truncate text-[10px] tracking-[0.2em] text-ink-3">
          {[`${season} SEASON`, ...facts].join(" · ")}
        </p>
      </div>
      <Link
        href="/league/teams"
        className="ml-auto shrink-0 border border-line px-2 py-1 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink"
      >
        ← ALL TEAM STATS
      </Link>
    </div>
  );
}

/** Label/value grid — the tail of every panel below its headline tiles. */
function StatGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-2 border border-line bg-bg px-2 py-1.5"
        >
          <dt className="text-[10px] tracking-widest text-ink-3">{label}</dt>
          <dd className="text-xs tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Record ─────────────────────────────────────────────────────────── */

function RecordBody({ r }: { r: StandingRow }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="W-L" value={`${r.wins}-${r.losses}`} />
        <MetricCard label="PCT" value={r.pct} />
        <MetricCard
          label="RUN DIFF"
          value={r.runDiff > 0 ? `+${r.runDiff}` : String(r.runDiff)}
        />
        <MetricCard label="STREAK" value={r.streak} />
      </div>
      <StatGrid
        items={[
          ["GB", r.gb],
          ["DIV RANK", r.divRank],
          ["LG RANK", r.leagueRank],
          ["MLB RANK", r.sportRank],
          ["RS", String(r.runsScored)],
          ["RA", String(r.runsAllowed)],
          ["L10", r.last10],
          ["HOME", r.home],
          ["AWAY", r.away],
          ["STRK", r.streak],
        ]}
      />
    </>
  );
}

async function RecordPanel({ id, season }: { id: number; season: number }) {
  let record: StandingRow | null;
  try {
    record = await getTeamRecord(id, season);
  } catch {
    return (
      <Panel title={`RECORD — ${season} SEASON`}>
        <Unavailable what="RECORD" />
      </Panel>
    );
  }

  return (
    <Panel
      title={`RECORD — ${season} SEASON`}
      right={
        record ? (
          <span className="text-[10px] text-ink-3">{record.division}</span>
        ) : undefined
      }
    >
      {record ? (
        <RecordBody r={record} />
      ) : (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO {season} STANDINGS LINE FOR THIS CLUB YET
        </p>
      )}
    </Panel>
  );
}

/* ── Season lines ───────────────────────────────────────────────────── */

function StatPanel({
  group,
  columns,
  row,
  season,
}: {
  group: "hitting" | "pitching";
  columns: TeamStatCol[];
  row: TeamStatRow | null;
  season: number;
}) {
  const headline = HEADLINE[group];
  const head = headline
    .map((k) => columns.find((c) => c.key === k))
    .filter((c): c is TeamStatCol => !!c);
  const rest = columns.filter((c) => !headline.includes(c.key));

  return (
    <Panel title={`TEAM ${group.toUpperCase()} — ${season} SEASON`}>
      {row ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {head.map((c) => (
              <MetricCard
                key={c.key}
                label={c.label}
                value={teamStatText(row.values[c.key])}
              />
            ))}
          </div>
          <StatGrid
            items={rest.map((c) => [c.label, teamStatText(row.values[c.key])])}
          />
        </>
      ) : (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO {season} {group.toUpperCase()} LINE FOR THIS CLUB YET
        </p>
      )}
    </Panel>
  );
}

async function StatPanels({ id, season }: { id: number; season: number }) {
  let lines: Awaited<ReturnType<typeof getTeamLines>>;
  try {
    lines = await getTeamLines(id, season);
  } catch {
    return (
      <Panel title={`TEAM STATS — ${season} SEASON`}>
        <Unavailable what="TEAM STATS" />
      </Panel>
    );
  }

  return (
    <>
      <StatPanel
        group="hitting"
        columns={TEAM_HITTING_COLS}
        row={lines.hitting}
        season={season}
      />
      <StatPanel
        group="pitching"
        columns={TEAM_PITCHING_COLS}
        row={lines.pitching}
        season={season}
      />
    </>
  );
}

/* ── Placeholders ───────────────────────────────────────────────────── */

/** Four headline tiles over a label/value grid — the shape of every panel. */
const StatPanelSkeleton = ({
  delay = 0,
  cells = 12,
}: {
  delay?: number;
  cells?: number;
}) => (
  <SkeletonPanel delay={delay} right>
    <SkeletonTiles delay={delay} />
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" delay={delay + i * 0.04} />
      ))}
    </div>
  </SkeletonPanel>
);

const RosterSkeleton = () => (
  <SkeletonPanel right>
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" delay={i * 0.1} />
      ))}
    </div>
  </SkeletonPanel>
);

/* ── Schedule ───────────────────────────────────────────────────────── */

/* Half a season at a time, because the whole of one is 162 rows and the point
 * of dropping the scrollbar was to see a stretch of it whole. The halves part
 * at the All-Star break, the way a season is actually talked about, not at the
 * 81st game. */
const HALVES = [
  { value: "1", label: "FIRST HALF" },
  { value: "2", label: "SECOND HALF" },
  { value: "all", label: "FULL SEASON" },
] as const;

/**
 * Which half to open on: for the season being played, the one it has reached,
 * so a club lands on the games in front of it rather than on opening day. A
 * season already in the books has no current half, so it opens whole.
 */
function pickHalf(
  raw: string | undefined,
  games: Game[],
  mid: number,
  season: number
): string {
  if (HALVES.some((h) => h.value === raw)) return raw!;
  if (season !== seasonOf(todayET())) return "all";
  return games.filter((g) => g.state === "Final").length > mid ? "2" : "1";
}

async function TeamSchedule({
  id,
  season,
  first,
  half,
}: {
  id: number;
  season: number;
  /** The club's first year, the floor of its season picker. */
  first: number;
  half: string | undefined;
}) {
  const [games, records, breakAt] = await Promise.all([
    getTeamSchedule(id, season),
    /* The decision columns are a nicety — a slow stats payload shouldn't
       cost the reader their schedule. */
    getPitcherRecords(season).catch(() => new Map<string, PitcherRecord>()),
    getBreakDate(season).catch(() => null),
  ]);
  const mid = breakIndex(games, breakAt);
  const shown = pickHalf(half, games, mid, season);
  const range =
    shown === "all" ? games : shown === "1" ? games.slice(0, mid) : games.slice(mid);

  return (
    <SchedulePanel
      id={id}
      games={range}
      records={records}
      title={`SCHEDULE — ${season}`}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <ParamSelect param="half" label="SHOW" value={shown} options={HALVES} />
          <SeasonSelect value={season} first={first} last={seasonOf(todayET())} />
        </div>
      }
    />
  );
}

/* ── Player stats ───────────────────────────────────────────────────── */

const STAT_GROUPS: StatGroup[] = ["hitting", "pitching", "fielding"];

/**
 * Every player's line, one table per group, for the season and slice of the
 * calendar the controls name. The club's own totals ride along underneath,
 * but only for a regular season: there is no team stats payload for October,
 * and the standings line it leads with would be a blank row.
 */
async function PlayerStats({
  id,
  season,
  gameType,
}: {
  id: number;
  season: number;
  gameType: PlayerGameType;
}) {
  const groups = await Promise.all(
    STAT_GROUPS.map((g) => getTeamPlayerStats(id, season, g, gameType))
  );

  return (
    <>
      {STAT_GROUPS.map((g, i) => (
        <PlayerStatTables
          key={g}
          group={g}
          columns={playerCols(g)}
          rows={groups[i]}
          season={season}
        />
      ))}
      {gameType === "R" && (
        <>
          <RecordPanel id={id} season={season} />
          <StatPanels id={id} season={season} />
        </>
      )}
    </>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────── */

/**
 * One tab's content. Everything but the home summary is a single request, so
 * a failure is caught here and shown as a notice in place of the section.
 */
async function TabBody({
  tab,
  id,
  season,
  statSeason,
  first,
  gameType,
  half,
}: {
  tab: TeamTab;
  id: number;
  season: number;
  /** The stats, schedule and transactions tabs read their own season. */
  statSeason: number;
  first: number;
  gameType: PlayerGameType;
  half: string | undefined;
}) {
  try {
    switch (tab) {
      case "home":
        return <TeamHome id={id} season={season} />;
      case "schedule":
        return (
          <TeamSchedule
            id={id}
            season={statSeason}
            first={first}
            half={half}
          />
        );
      case "stats":
        return (
          <PlayerStats id={id} season={statSeason} gameType={gameType} />
        );
      case "roster":
        return <RosterPanel groups={await getTeamRosterGroups(id, season)} />;
      case "splits": {
        const [hitting, pitching] = await Promise.all([
          getTeamSplits(id, season, "hitting"),
          getTeamSplits(id, season, "pitching"),
        ]);
        return (
          <SplitsPanels hitting={hitting} pitching={pitching} season={season} />
        );
      }
      case "injuries":
        return <InjuriesPanel players={await getTeamInjuries(id, season)} />;
      case "transactions":
        return (
          <TransactionsPanel
            moves={await getTeamTransactions(id, statSeason)}
            controls={
              <SeasonSelect
                value={statSeason}
                first={first}
                last={seasonOf(todayET())}
              />
            }
          />
        );
    }
  } catch {
    return <Unavailable what={tab.toUpperCase()} />;
  }
}

/** The placeholder each tab streams in behind — panel-shaped, tab-sized. */
function TabSkeleton({ tab }: { tab: TeamTab }) {
  if (tab === "roster") return <RosterSkeleton />;
  if (tab === "stats")
    return (
      <>
        <StatPanelSkeleton cells={10} />
        <StatPanelSkeleton delay={0.08} />
      </>
    );
  return (
    <SkeletonPanel right>
      <Skeleton className="h-96 w-full" />
    </SkeletonPanel>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

/** A `?season=` the club can actually have played, else the running one. */
function pickSeason(
  raw: string | undefined,
  first: number,
  current: number
): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= first && n <= current ? n : current;
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  /* The catch-all is optional, so /team/120 arrives with no segment at all —
     that is the home tab, which keeps the club's canonical URL clean. */
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<{ season?: string; type?: string; half?: string }>;
}) {
  const { id, tab } = await params;
  const teamId = teamIdOf(id);
  if (!Number.isFinite(teamId)) notFound();
  const section = tab?.[0] ?? "home";
  if (tab && (tab.length > 1 || !isTeamTab(section))) notFound();
  const season = seasonOf(todayET());

  let team: TeamIdentity | null;
  try {
    team = await getTeamIdentity(teamId, season);
  } catch {
    return (
      <div className="mx-auto max-w-7xl p-3">
        <Unavailable what="TEAM" />
      </div>
    );
  }
  if (!team) notFound();

  /* Only the tabs that carry a season control read the query string — every
     other tab stays on the running season. */
  const stats = section === "stats";
  const dated = stats || section === "schedule" || section === "transactions";
  const sp = dated ? await searchParams : {};
  const first = Number(team.firstYear) || FIRST_SEASON;
  const statSeason = pickSeason(sp.season, first, season);
  const gameType = pickPlayerGameType(sp.type);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Identity t={team} season={season} />
      <TeamTabs id={teamId} name={team.name} active={section} />
      {stats && (
        <div className="flex flex-wrap items-center justify-end gap-3 border border-line bg-surface px-3 py-2">
          <ParamSelect
            param="type"
            label="TYPE"
            value={gameType}
            options={PLAYER_GAME_TYPES}
          />
          <SeasonSelect value={statSeason} first={first} last={season} />
        </div>
      )}
      {/* Keyed on the tab, so switching re-suspends into the skeleton rather
          than holding the last section on screen. */}
      <Suspense
        key={`${section}-${statSeason}-${gameType}-${sp.half ?? ""}`}
        fallback={<TabSkeleton tab={section as TeamTab} />}
      >
        <div className="space-y-3">
          <TabBody
            tab={section as TeamTab}
            id={teamId}
            season={season}
            statSeason={statSeason}
            first={first}
            gameType={gameType}
            half={sp.half}
          />
        </div>
      </Suspense>
    </div>
  );
}
