import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import Standings from "@/components/mlb/Standings";
import TeamStats from "@/components/mlb/TeamStats";
import Leaderboards from "@/components/mlb/Leaderboards";
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
} from "@/lib/mlb";

/*
 * One league reference section per route — the targets the league bar opens
 * in their own tabs. Data comes from the same cached lib/mlb helpers the
 * dashboard uses; a dead source degrades to an inline notice rather than
 * throwing, so an unreachable MLB API never blanks the tab.
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

async function sectionBody(id: LeagueSection, date: string, season: number) {
  try {
    switch (id) {
      case "leaders":
        return <Leaderboards boards={await getLeaderboards(season, 5)} />;
      case "probables":
        return <ProbablePitchers games={await getSchedule(date)} />;
      case "standings":
        return <Standings divisions={await getStandings(season)} />;
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
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const found = findSection(section);
  if (!found) notFound();

  const date = todayET();
  const season = seasonOf(date);
  const body = await sectionBody(found.id, date, season);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Panel
        title={found.title}
        right={
          <span className="text-[10px] text-ink-3">
            {date} · SEASON {season}
          </span>
        }
      >
        {body}
      </Panel>
    </div>
  );
}
