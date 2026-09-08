import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import { SkeletonPanel, SkeletonTiles } from "@/components/ui/Skeleton";
import SectionSkeleton from "@/components/ui/SectionSkeleton";
import Standings from "@/components/mlb/Standings";
import Leaderboards from "@/components/mlb/Leaderboards";
import ProbablePitchers, {
  probableGames,
} from "@/components/mlb/ProbablePitchers";
import PlayerSearch from "@/components/landing/PlayerSearch";
import {
  getSchedule,
  getStandings,
  getLeaderboards,
  todayPT,
  seasonOf,
  type Game,
} from "@/lib/mlb";
import { getProjections } from "@/lib/api";

/*
 * League overview: today's scoreboard, probable pitchers, standings, and
 * season stat leaders — from the MLB Stats API, plus our own projected
 * standings, all fetched server-side.
 *
 * Each section fetches and streams on its own, behind a skeleton of its own
 * shape, so the header lands immediately and the slowest source only holds
 * back its own panel. A failing source degrades to empty rather than throwing:
 * no projection just means fewer standings columns, and a dead schedule leaves
 * the standings intact.
 */

/* ── Sections ───────────────────────────────────────────────────────── */

/** Snapshot metrics and today's probables — both read the same slate. */
async function ScheduleSections({ date }: { date: string }) {
  const games: Game[] = await getSchedule(date).catch(() => []);
  const live = games.filter((g) => g.state === "Live").length;
  const final = games.filter((g) => g.state === "Final").length;
  const probables = probableGames(games);

  return (
    <>
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        <MetricCard label="GAMES TODAY" value={String(games.length)} sub={date} />
        <MetricCard label="LIVE NOW" value={String(live)} sub="IN PROGRESS" />
        <MetricCard label="FINAL" value={String(final)} sub="COMPLETED" />
        <MetricCard
          label="PROBABLES SET"
          value={String(probables.length)}
          sub="ANNOUNCED MATCHUPS"
        />
      </div>

      {probables.length > 0 && (
        <Panel title="PROBABLE PITCHERS — TODAY">
          <ProbablePitchers games={games} />
        </Panel>
      )}
    </>
  );
}

async function StandingsSection({ season }: { season: number }) {
  const [divisions, projection] = await Promise.all([
    getStandings(season).catch(() => []),
    getProjections(season).catch(() => null),
  ]);
  return (
    <Panel title="STANDINGS">
      <Standings divisions={divisions} projection={projection} />
    </Panel>
  );
}

async function LeadersSection({ season }: { season: number }) {
  const boards = await getLeaderboards(season).catch(() => []);
  return (
    <Panel title="STAT LEADERS">
      <Leaderboards boards={boards} season={season} />
    </Panel>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default async function DashboardPage() {
  const date = todayPT();
  const season = seasonOf(date);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      {/* ── Header + player search ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-3 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-bold tracking-wide">LEAGUE OVERVIEW</h1>
          <span className="text-[11px] text-ink-3">
            {date} · SEASON {season}
          </span>
        </div>
        <div className="w-full sm:w-72">
          <PlayerSearch size="compact" placeholder="SEARCH PITCHER →" />
        </div>
      </div>

      <Suspense
        fallback={
          <>
            <SkeletonTiles />
            <SkeletonPanel>
              <SectionSkeleton section="probables" />
            </SkeletonPanel>
          </>
        }
      >
        <ScheduleSections date={date} />
      </Suspense>

      <Suspense
        fallback={
          <SkeletonPanel delay={0.08}>
            <SectionSkeleton section="standings" />
          </SkeletonPanel>
        }
      >
        <StandingsSection season={season} />
      </Suspense>

      <Suspense
        fallback={
          <SkeletonPanel delay={0.16}>
            <SectionSkeleton section="leaders" />
          </SkeletonPanel>
        }
      >
        <LeadersSection season={season} />
      </Suspense>
    </div>
  );
}
