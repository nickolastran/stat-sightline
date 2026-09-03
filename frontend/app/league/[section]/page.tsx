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
import GameGrid from "@/components/mlb/GameGrid";
import ScoreboardDate from "@/components/mlb/ScoreboardDate";
import ParamSelect from "@/components/mlb/ParamSelect";
import ParamTabs from "@/components/mlb/ParamTabs";
import StatLeaders from "@/components/mlb/StatLeaders";
import { Glossary } from "@/components/mlb/TeamPanels";
import WildCard from "@/components/mlb/WildCard";
import StandingsViews from "@/components/mlb/StandingsViews";
import {
  LEAGUE_SECTIONS,
  findSection,
  sectionWidth,
  type LeagueSection,
} from "@/lib/leagueSections";
import {
  getSchedule,
  getStandings,
  getWildCard,
  getTeamStats,
  getLeaderboards,
  getStatLeaders,
  pickLeaderOrder,
  playerCols,
  pickLeaderStat,
  pickPlayerGameType,
  LEADER_LEAGUES,
  LEADER_POSITIONS,
  PLAYER_GAME_TYPES,
  QUALIFIER_NOTE,
  todayET,
  seasonOf,
  pickGameType,
  FIRST_SEASON,
  GAME_TYPES,
  type GameType,
  type PlayerGameType,
  type StatGroup,
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

/**
 * A `?date=` that names a real calendar day, else today. This goes straight
 * into an MLB API query, and "2025-02-31" parses into March — round-tripping
 * through ISO is what rejects it.
 */
function pickDate(raw: string | undefined, today: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw)
    ? raw
    : today;
}

/* What the player table reads out of the query string. Its own type because
   the page resolves it once and both the controls and the body read it. */
interface PlayerQuery {
  group: StatGroup;
  type: PlayerGameType;
  stat: string;
  league: string;
  position: string;
  /** Set only when the reader has flipped the column off MLB's own order. */
  order?: "asc" | "desc";
}

const PLAYER_GROUPS: { value: StatGroup; label: string }[] = [
  { value: "hitting", label: "BATTING" },
  { value: "pitching", label: "PITCHING" },
  { value: "fielding", label: "FIELDING" },
];

const pickGroup = (raw: string | undefined): StatGroup =>
  raw === "pitching" || raw === "fielding" ? raw : "hitting";

const inList = (raw: string | undefined, options: { value: string }[]) =>
  options.some((o) => o.value === raw) ? raw! : "all";

/** The projection, or null if it isn't available — never a thrown error. */
async function projectionOrNull(season: number): Promise<StandingsProjection | null> {
  return getProjections(season).catch(() => null);
}

async function SectionBody({
  id,
  date,
  season,
  gameType,
  players,
  views,
  seasonOver,
}: {
  id: LeagueSection;
  date: string;
  season: number;
  gameType: GameType;
  /** What the player table is showing — group, sort, filters, page size. */
  players: PlayerQuery;
  /** A past season, so who made the playoffs is already decided. */
  seasonOver: boolean;
  /** The STANDINGS / WILD CARD buttons, for the two sections that show them. */
  views: React.ReactNode;
}) {
  try {
    switch (id) {
      case "scoreboard":
        return <GameGrid games={await getSchedule(date)} />;
      case "leaders":
        return (
          <Leaderboards boards={await getLeaderboards(season)} season={season} />
        );
      case "probables":
        return <ProbablePitchers games={await getSchedule(date)} />;
      case "standings": {
        /* The projection is fit on regular-season schedules, so it has nothing
           to say about a spring slate — the columns drop rather than mislead. */
        const [divisions, projection] = await Promise.all([
          getStandings(season, gameType),
          gameType === "R" ? projectionOrNull(season) : null,
        ]);
        return (
          <Standings
            divisions={divisions}
            projection={projection}
            left={views}
            seasonOver={seasonOver}
          />
        );
      }
      case "wildcard":
        return (
          <WildCard
            groups={await getWildCard(season)}
            left={views}
            seasonOver={seasonOver}
          />
        );
      case "teams":
        return <TeamStats tables={await getTeamStats(season, gameType)} />;
      case "players": {
        const columns = playerCols(players.group);
        const board = await getStatLeaders({
          season,
          group: players.group,
          gameType: players.type,
          stat: players.stat,
          league: players.league,
          position: players.position,
          order: players.order,
        });
        return (
          <div className="space-y-3">
            <StatLeaders
              columns={columns}
              rows={board.rows}
              total={board.total}
              stat={players.stat}
              query={{ ...players, season }}
              note={QUALIFIER_NOTE[players.group]}
            />
            <Glossary columns={columns} />
          </div>
        );
      }
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
  searchParams: Promise<{
    season?: string;
    date?: string;
    type?: string;
    group?: string;
    stat?: string;
    league?: string;
    pos?: string;
    order?: string;
  }>;
}) {
  const { section } = await params;
  const found = findSection(section);
  if (!found) notFound();

  const today = todayET();
  const current = seasonOf(today);
  /* Which controls a section carries: the scoreboard picks a game day, and
     everything that reports a season total picks the season — the standings
     and team tables also picking which half of the calendar it covers.
     Probables is today's slate only, so it reads no searchParams at all and
     stays statically prerenderable. */
  const scoreboard = found.id === "scoreboard";
  const playerBoard = found.id === "players";
  const seasonal =
    found.id === "leaders" ||
    found.id === "standings" ||
    found.id === "wildcard" ||
    found.id === "teams" ||
    playerBoard;
  /* Spring training has no wild-card race of its own, and the leader boards
     are regular-season figures. */
  const typed = found.id === "standings" || found.id === "teams";
  const sp = seasonal || scoreboard ? await searchParams : {};
  const season = seasonal ? pickSeason(sp.season, current) : current;
  const date = scoreboard ? pickDate(sp.date, today) : today;
  const gameType = typed ? pickGameType(sp.type) : "R";
  const group = pickGroup(sp.group);
  const players: PlayerQuery = {
    group,
    /* Player boards carry a post-season of their own, which no standings or
       team table does — so this is the three-way game type, not the two. */
    type: pickPlayerGameType(sp.type),
    stat: pickLeaderStat(sp.stat, group),
    league: inList(sp.league, LEADER_LEAGUES),
    position: inList(sp.pos, LEADER_POSITIONS),
    order: pickLeaderOrder(sp.order),
  };

  /* The standings and the wild-card race are two routes with one control row,
     so switching between them carries the season and game type across rather
     than dropping the reader back on today. */
  const standingsView = found.id === "standings" || found.id === "wildcard";
  /* Read off the raw parameter, not the resolved one: the wild-card race has
     no spring slate of its own and so resolves to "R", but it should still
     hand a reader back to the spring standings they came from. */
  const carried = pickGameType(sp.type);
  const viewQuery =
    season === current && carried === "R"
      ? ""
      : `?season=${season}${carried === "R" ? "" : `&type=${carried}`}`;

  return (
    <div className={`mx-auto ${sectionWidth(found.id)} space-y-3 p-3`}>
      <Panel
        title={found.title}
        right={
          scoreboard ? (
            <ScoreboardDate value={date} today={today} />
          ) : playerBoard ? (
            <div className="flex flex-wrap items-center gap-3">
              <ParamSelect
                param="type"
                label="TYPE"
                value={players.type}
                options={PLAYER_GAME_TYPES}
              />
              <ParamSelect
                param="league"
                label="LEAGUE"
                value={players.league}
                options={LEADER_LEAGUES}
              />
              <ParamSelect
                param="pos"
                label="POS"
                value={players.position}
                options={LEADER_POSITIONS}
              />
              <SeasonSelect value={season} first={FIRST_SEASON} last={current} />
            </div>
          ) : seasonal ? (
            <div className="flex flex-wrap items-center gap-3">
              {typed && (
                <ParamSelect
                  param="type"
                  label="TYPE"
                  value={gameType}
                  options={GAME_TYPES}
                />
              )}
              <SeasonSelect value={season} first={FIRST_SEASON} last={current} />
            </div>
          ) : (
            /* Probables is today's slate, so it carries the day it was read. */
            <span className="text-[10px] text-ink-3">{date}</span>
          )
        }
      >
        {playerBoard && (
          <div className="mb-3 flex">
            <ParamTabs
              param="group"
              ariaLabel="Stat group"
              size="lg"
              value={players.group}
              options={PLAYER_GROUPS}
            />
          </div>
        )}
        {/* Keyed on what the section is showing, so switching year or day
            re-suspends into the skeleton rather than holding the last one. */}
        <Suspense
          key={`${season}-${date}-${gameType}-${Object.values(players).join("-")}`}
          fallback={<SectionSkeleton section={found.id} />}
        >
          <SectionBody
            id={found.id}
            date={date}
            season={season}
            gameType={gameType}
            players={players}
            seasonOver={season < current}
            views={
              standingsView ? (
                <StandingsViews
                  active={found.id}
                  query={viewQuery}
                  hideWildCard={found.id === "standings" && carried === "S"}
                />
              ) : null
            }
          />
        </Suspense>
      </Panel>
    </div>
  );
}
