import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Skeleton, SkeletonPanel } from "@/components/ui/Skeleton";
import TeamTabs, { isTeamTab, type TeamTab } from "@/components/mlb/TeamTabs";
import TeamHome from "@/components/mlb/TeamHome";
import PlayerStatTables from "@/components/mlb/PlayerStatTables";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ParamSelect from "@/components/mlb/ParamSelect";
import ParamTabs from "@/components/mlb/ParamTabs";
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
  tradedPlayers,
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
  todayET,
  type TeamIdentity,
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

/* ── Placeholders ───────────────────────────────────────────────────── */

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

const STAT_GROUPS: { value: StatGroup; label: string }[] = [
  { value: "hitting", label: "BATTING" },
  { value: "pitching", label: "PITCHING" },
  { value: "fielding", label: "FIELDING" },
];

/* One group at a time, the way MLB's own stats page reads, rather than three
   tables stacked: a reader is looking at one of them, and the other two cost a
   request each. Anything but a group name reads as batting. */
const pickStatGroup = (raw: string | undefined): StatGroup =>
  raw === "pitching" || raw === "fielding" ? raw : "hitting";

/**
 * Every player's line in one group, for the season and slice of the calendar
 * the controls name — the club's leaders in that group over the table. Its own
 * totals ride along underneath, but only for a regular season: there is no team
 * stats payload for October, and the standings line it leads with would be a
 * blank row.
 */
async function PlayerStats({
  id,
  season,
  gameType,
  group,
}: {
  id: number;
  season: number;
  gameType: PlayerGameType;
  group: StatGroup;
}) {
  const [rows, moves] = await Promise.all([
    getTeamPlayerStats(id, season, group, gameType),
    /* The marks beside the names are a nicety — a slow transaction log
       shouldn't cost the reader their stats. */
    getTeamTransactions(id, season).catch(() => []),
  ]);

  return (
    <PlayerStatTables
      group={group}
      columns={playerCols(group)}
      rows={rows}
      season={season}
      traded={tradedPlayers(moves)}
    />
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
  group,
  half,
}: {
  tab: TeamTab;
  id: number;
  season: number;
  /** The stats, schedule and transactions tabs read their own season. */
  statSeason: number;
  first: number;
  gameType: PlayerGameType;
  /** Which table the stats tab is showing. */
  group: StatGroup;
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
          <PlayerStats
            id={id}
            season={statSeason}
            gameType={gameType}
            group={group}
          />
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
      <SkeletonPanel right>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" delay={i * 0.04} />
          ))}
        </div>
        <Skeleton className="h-96 w-full" delay={0.2} />
      </SkeletonPanel>
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
  searchParams: Promise<{
    season?: string;
    type?: string;
    group?: string;
    half?: string;
  }>;
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
  const statGroup = pickStatGroup(sp.group);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Identity t={team} season={season} />
      <TeamTabs id={teamId} name={team.name} active={section} />
      {stats && (
        <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-3 py-2">
          <ParamTabs
            param="group"
            ariaLabel="Stat group"
            size="lg"
            value={statGroup}
            options={STAT_GROUPS}
          />
          <div className="ml-auto flex flex-wrap items-center gap-3">
          <ParamSelect
            param="type"
            label="TYPE"
            value={gameType}
            options={PLAYER_GAME_TYPES}
          />
          <SeasonSelect value={statSeason} first={first} last={season} />
          </div>
        </div>
      )}
      {/* Keyed on the tab, so switching re-suspends into the skeleton rather
          than holding the last section on screen. */}
      <Suspense
        key={`${section}-${statSeason}-${gameType}-${statGroup}-${sp.half ?? ""}`}
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
            group={statGroup}
            half={sp.half}
          />
        </div>
      </Suspense>
    </div>
  );
}
