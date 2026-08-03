import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import SectionSkeleton from "@/components/ui/SectionSkeleton";
import Standings from "@/components/mlb/Standings";
import TeamStats from "@/components/mlb/TeamStats";
import Leaderboards from "@/components/mlb/Leaderboards";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ProbablePitchers from "@/components/mlb/ProbablePitchers";
import {
  LEAGUE_SECTIONS,
  findSection,
  type LeagueSection,
} from "@/lib/leagueSections";
import {
  getSchedule,
  getStandings,
  getTeamStats,
  getLeaderboards,
  todayET,
  seasonOf,
  FIRST_SEASON,
} from "@/lib/mlb";
import { getProjections, type StandingsProjection } from "@/lib/api";

/*
 * One league reference section per route — the targets the league bar opens
 * in their own tabs. Data comes from the same cached lib/mlb helpers the
 * dashboard uses; a dead source degrades to an inline notice rather than
 * throwing, so an unreachable MLB API never blanks the tab.
 *
 * The projection columns are the one piece served by our own API rather than
 * MLB's, so they are fetched separately and dropped on failure: standings
 * still render in full when the model hasn't been built or the API is down.
 *
 * The panel is flushed before its body is fetched, so the section streams in
 * behind a skeleton of its own shape rather than the tab sitting blank.
 */

export function generateStaticParams() {
  return LEAGUE_SECTIONS.map((s) => ({ section: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const found = findSection(section);
  return {
    title: found
      ? `${found.title} — STAT//SIGHTLINE`
      : "STAT//SIGHTLINE",
  };
}

/** A `?season=` the boards can actually serve, else the running season. */
function pickSeason(raw: string | undefined, current: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= FIRST_SEASON && n <= current ? n : current;
}

/** The projection, or null if it isn't available — never a thrown error. */
async function projectionOrNull(season: number): Promise<StandingsProjection | null> {
  return getProjections(season).catch(() => null);
}

async function SectionBody({
  id,
  date,
  season,
}: {
  id: LeagueSection;
  date: string;
  season: number;
}) {
  try {
    switch (id) {
      case "leaders":
        return <Leaderboards boards={await getLeaderboards(season)} />;
      case "probables":
        return <ProbablePitchers games={await getSchedule(date)} />;
      case "standings": {
        const [divisions, projection] = await Promise.all([
          getStandings(season),
          projectionOrNull(season),
        ]);
        return <Standings divisions={divisions} projection={projection} />;
      }
      case "teams":
        return <TeamStats tables={await getTeamStats(season)} />;
    }
  } catch {
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        UNAVAILABLE — MLB API UNREACHABLE
      </p>
    );
  }
}

export default async function LeagueSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { section } = await params;
  const found = findSection(section);
  if (!found) notFound();

  const date = todayET();
  const current = seasonOf(date);
  /* Only the leader boards read back through history, so only they touch
     searchParams — the other sections stay statically prerenderable. */
  const leaders = found.id === "leaders";
  const season = leaders
    ? pickSeason((await searchParams).season, current)
    : current;

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Panel
        title={found.title}
        right={
          leaders ? (
            <SeasonSelect value={season} first={FIRST_SEASON} last={current} />
          ) : (
            /* Every other section is a snapshot, so it carries the day it
               was read; a season total doesn't. */
            <span className="text-[10px] text-ink-3">
              {date} · SEASON {season}
            </span>
          )
        }
      >
        {/* Keyed on the season so switching years re-suspends into the
            skeleton rather than holding the previous year's board. */}
        <Suspense key={season} fallback={<SectionSkeleton section={found.id} />}>
          <SectionBody id={found.id} date={date} season={season} />
        </Suspense>
      </Panel>
    </div>
  );
}
