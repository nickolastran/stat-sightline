import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import { Skeleton, SkeletonPanel, SkeletonTiles } from "@/components/ui/Skeleton";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ParamTabs from "@/components/mlb/ParamTabs";
import ParamSelect from "@/components/mlb/ParamSelect";
import PlayerTabs, {
  isPlayerTab,
  type PlayerTab,
} from "@/components/mlb/PlayerTabs";
import { SplitsPanels } from "@/components/mlb/TeamPanels";
import {
  BioPanel,
  CareerPanel,
  type CareerSection,
  GameLogPanel,
  HeadlineTiles,
  NextGamePanel,
  RecentGamesPanel,
  SeasonSummaryPanel,
  SplitsSummaryPanel,
} from "@/components/mlb/PlayerPanels";
import {
  EMPTY_CAREER,
  gameLogCols,
  getPlayer,
  getPlayerBio,
  getPlayerCareer,
  getPlayerGameLog,
  getPlayerGroups,
  getPlayerSeasons,
  getPlayerSplits,
  getTeamSchedule,
  groupOptions,
  pickPlayerGameType,
  pickPlayerGroup,
  playerCols,
  PLAYER_GAME_TYPES,
  playerHeadshot,
  seasonOf,
  seriesTotals,
  teamLogo,
  todayPT,
  type Game,
  type PlayerGameType,
  type PlayerSummary,
  type StatGroup,
} from "@/lib/mlb";

/*
 * One player's page — the target of every PlayerLink. An identity bar, a tab
 * strip, and the controls the sections share: which line is being read
 * (batting, pitching, fielding — all three for a two-way player) and which
 * season.
 *
 * The tabs are segments of one optional catch-all route rather than files of
 * their own, so identity and chrome are fetched and written once and each tab
 * pays only for its own payload — the same shape the club's page takes. Only
 * identity is awaited before rendering; the body streams in behind a skeleton,
 * which is also what keeps the 404 honest.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlayer(Number(id), seasonOf(todayPT())).catch(() => null);
  return { title: p ? `${p.name} — STAT//SIGHTLINE` : "STAT//SIGHTLINE" };
}

/** What the splits tab can be read over — one season, or all of them. */
const SPLIT_SPANS = [
  { value: "season", label: "SEASON" },
  { value: "career", label: "CAREER" },
];

function Unavailable({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what} UNAVAILABLE — MLB API UNREACHABLE
    </p>
  );
}

function Identity({ p }: { p: PlayerSummary }) {
  const facts = [
    p.pos,
    p.number && `#${p.number}`,
    `B/T ${p.bats}/${p.throws}`,
    p.age !== null && `AGE ${p.age}`,
    p.height && p.weight ? `${p.height} · ${p.weight} LB` : "",
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playerHeadshot(p.id, 120)}
        alt=""
        width={56}
        height={56}
        className="h-14 w-14 shrink-0"
      />
      {p.teamId && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={teamLogo(p.teamId)}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0"
        />
      )}
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-wider text-ink">
          {p.name.toUpperCase()}
        </h1>
        <p className="mt-1 truncate text-[10px] tracking-[0.2em] text-ink-3">
          {[p.team.toUpperCase(), ...facts].join(" · ")}
        </p>
      </div>
      <Link
        href={`/compare?ids=${p.id}`}
        className="ml-auto shrink-0 rounded border border-line px-2 py-1 text-[10px] tracking-[0.2em] text-ink-3 hover:border-accent hover:text-ink"
      >
        COMPARE
      </Link>
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────────── */

/** The club's next game, or its last once the season has run out of them. */
async function nextGame(teamId: number | null, season: number): Promise<Game | null> {
  if (!teamId) return null;
  const games = await getTeamSchedule(teamId, season).catch(() => [] as Game[]);
  return games.find((g) => g.state !== "Final") ?? games[games.length - 1] ?? null;
}

/**
 * A little of every other tab: what's next, how the season has gone in the
 * slices anyone checks first, the season against the career, and the last few
 * games. Every block links through to the tab it is a preview of.
 */
async function Overview({
  player,
  season,
  group,
  href,
}: {
  player: PlayerSummary;
  season: number;
  group: StatGroup;
  /** The player's URL prefix, for the SEE ALL links. */
  href: string;
}) {
  /* No fielding splits — MLB doesn't report one, so that dropdown falls back
     to the batting slices the rest of the page is being read with. */
  const splitGroup = group === "pitching" ? "pitching" : "hitting";
  const query = `?season=${season}&group=${group}`;
  const [game, career, post, splits, log] = await Promise.all([
    nextGame(player.teamId, season),
    getPlayerCareer(player.id, group).catch(() => EMPTY_CAREER),
    getPlayerCareer(player.id, group, true).catch(() => EMPTY_CAREER),
    getPlayerSplits(player.id, season, splitGroup).catch(() => []),
    getPlayerGameLog(player.id, season, group).catch(() => []),
  ]);
  const line = player.lines.find((l) => l.group === group);
  const year = String(season);

  return (
    <div className="space-y-3">
      {line && <HeadlineTiles line={line} />}
      <NextGamePanel game={game} />
      <RecentGamesPanel
        columns={gameLogCols(group).game}
        months={log}
        href={`${href}/gamelog${query}`}
      />
      <SplitsSummaryPanel
        sections={splits}
        columns={playerCols(splitGroup)}
        href={`${href}/splits${query}`}
        season={season}
      />
      <SeasonSummaryPanel
        group={group}
        season={season}
        seasonRows={career.rows.filter((r) => r.season === year)}
        postRows={post.rows.filter((r) => r.season === year)}
        career={career.total}
        href={`${href}/stats?group=${group}`}
      />
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────── */

/** One tab's content. A failure inside it is a notice, not a blank page. */
async function TabBody({
  tab,
  player,
  season,
  career,
  group,
  groups,
  gameType,
  controls,
}: {
  tab: PlayerTab;
  player: PlayerSummary;
  season: number;
  /** Splits only: read the whole career rather than the picked season. */
  career: boolean;
  /** The line the one-season tabs are reading. */
  group: StatGroup;
  /** Every line the player has — the stats tab shows them all at once. */
  groups: StatGroup[];
  /** Which half of the calendar the game log reads. */
  gameType: PlayerGameType;
  controls: React.ReactNode;
}) {
  const id = player.id;
  try {
    switch (tab) {
      case "overview":
        return (
          <Overview
            player={player}
            season={season}
            group={group}
            href={`/player/${id}`}
          />
        );
      case "stats": {
        /* Every line the player has, stacked — the group control belongs to
           the tabs that show one season at a time, not to a whole career. */
        const sections = await Promise.all(
          groups.map(async (g): Promise<CareerSection> => {
            const [regular, postseason] = await Promise.all([
              getPlayerCareer(id, g),
              getPlayerCareer(id, g, true).catch(() => EMPTY_CAREER),
            ]);
            return { group: g, regular, postseason };
          })
        );
        return <CareerPanel sections={sections} />;
      }
      case "bio": {
        const bio = await getPlayerBio(id);
        if (!bio) return <Unavailable what="BIOGRAPHY" />;
        return (
          <BioPanel
            bio={bio}
            team={player.team}
            teamId={player.teamId}
            bats={player.bats}
            throws={player.throws}
            height={player.height}
            weight={player.weight}
            age={player.age}
          />
        );
      }
      case "splits": {
        const g = group === "pitching" ? "pitching" : "hitting";
        const over = career ? "career" : season;
        return (
          <SplitsPanels
            group={g}
            sections={await getPlayerSplits(id, over, g)}
            season={over}
            columns={playerCols(g)}
          />
        );
      }
      case "gamelog": {
        const { game, running } = gameLogCols(group);
        /* October is not a season's log but a career's, so it is not banded
           by month and carries no year in its title. */
        const post = gameType === "P";
        const bands = await getPlayerGameLog(id, season, group, gameType);
        return (
          <GameLogPanel
            bands={bands}
            totals={post ? seriesTotals(group, bands) : undefined}
            group={group}
            title={post ? "POSTSEASON GAME LOG" : `GAME LOG — ${season}`}
            empty={post ? "NO POSTSEASON GAMES ON RECORD" : "NO GAMES IN THIS SEASON"}
            columns={game}
            running={running}
            controls={controls}
          />
        );
      }
    }
  } catch {
    return <Unavailable what={tab.toUpperCase()} />;
  }
}

/** The placeholder each tab streams in behind — panel-shaped, tab-sized. */
function TabSkeleton({ tab }: { tab: PlayerTab }) {
  if (tab === "overview")
    return (
      <div className="space-y-3">
        <SkeletonTiles />
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} delay={i * 0.1} right>
            <Skeleton className="h-40 w-full" delay={i * 0.1 + 0.05} />
          </SkeletonPanel>
        ))}
      </div>
    );
  return (
    <SkeletonPanel right>
      <Skeleton className="h-96 w-full" />
    </SkeletonPanel>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

/*
 * The season to show: whatever `?season=` names, as long as the player has a
 * line in it — a hand-edited year they never played would render an empty
 * page. Otherwise their latest season, which for an active player is the
 * running one and for a retired player is their last.
 */
function pickSeason(
  raw: string | undefined,
  seasons: number[],
  current: number
): number {
  const n = Number(raw);
  if (Number.isInteger(n) && seasons.includes(n)) return n;
  return seasons[0] ?? current;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  /* The catch-all is optional, so /player/592450 arrives with no segment at
     all — that is the overview, which keeps the canonical URL clean. */
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<{
    season?: string;
    group?: string;
    type?: string;
    over?: string;
  }>;
}) {
  const { id, tab } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();
  const section = tab?.[0] ?? "overview";
  if (tab && (tab.length > 1 || !isPlayerTab(section))) notFound();
  const current = seasonOf(todayPT());

  // A career that can't be read is only the season picker missing, not the
  // page — fall back to the running season and carry on.
  const seasons = await getPlayerSeasons(playerId).catch(() => []);
  const sp = await searchParams;
  const season = pickSeason(sp.season, seasons, current);
  /* What the reader actually set, carried across the tab strip — not what
     the page defaulted to, which would put a season on every clean URL. */
  const query = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => !!e[1])
  ).toString();

  let player: PlayerSummary | null;
  try {
    player = await getPlayer(playerId, season);
  } catch {
    return (
      <div className="mx-auto max-w-[96rem] p-3">
        <Unavailable what="PLAYER" />
      </div>
    );
  }
  if (!player) notFound();

  /* Which lines this player has: a hitter's two, a pitcher's two, a two-way
     player's three. A dead lookup still leaves a readable page — batting is
     what all but a few hundred players are read for. */
  const groups = await getPlayerGroups(playerId, player.pos).catch(
    (): StatGroup[] => ["hitting", "fielding"]
  );
  const group = pickPlayerGroup(sp.group, groups);
  /* Only the game log reads it, and only two of the three values mean
     anything there — a player has no spring-training log worth a tab. */
  const gameType = pickPlayerGameType(sp.type) === "P" ? "P" : "R";
  /* The splits tab reads one season, or the whole career at once. */
  const career = section === "splits" && sp.over === "career";
  /* Neither October's log nor a career of splits has a year to pick — both
     are the whole of it at once. */
  const seasonal = !(section === "gamelog" && gameType === "P") && !career;
  /* There is no fielding split, so that tab offers one fewer choice than the
     rest and lands on batting when fielding was the standing pick. */
  const splitGroups = groups.filter((g) => g !== "fielding");
  /* Two tabs have nothing to control: the bio is fixed, and the career table
     stacks every line of every season rather than showing one at a time. */
  const hasControls = section !== "bio" && section !== "stats";

  /* One group strip either way — splits offer one line fewer and land on
     batting when fielding was the standing pick. No fragment around the pair:
     this is a server component, and a fragment's children reach the client as
     a bare array, which React then wants keys on. */
  const splits = section === "splits";
  const controls = hasControls ? (
    <div className="flex w-full flex-wrap items-center gap-3">
      {(!splits || splitGroups.length > 1) && (
        <ParamTabs
          param="group"
          ariaLabel="Stat group"
          value={splits && group === "fielding" ? "hitting" : group}
          options={groupOptions(splits ? splitGroups : groups)}
        />
      )}
      {splits && (
        <ParamTabs
          param="over"
          ariaLabel="Span"
          value={career ? "career" : "season"}
          options={SPLIT_SPANS}
        />
      )}
      {/* Pushed right in the control bar, where the group tabs lead; inert
          in a panel header, which already right-aligns what it is given. */}
      <span className="ml-auto flex flex-wrap items-center gap-3">
        {section === "gamelog" && (
          <ParamSelect
            param="type"
            label="TYPE"
            value={gameType}
            options={PLAYER_GAME_TYPES.filter((t) => t.value !== "S")}
          />
        )}
        {seasons.length > 0 && seasonal && (
          <SeasonSelect value={season} seasons={seasons} />
        )}
      </span>
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <Identity p={player} />
      <PlayerTabs id={playerId} active={section} query={query} />
      {/* The career and game-log tables carry the controls in their own
          header; the rest get a bar of their own above the section. */}
      {hasControls && section !== "gamelog" && (
        <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-3 py-2">
          {controls}
        </div>
      )}
      {seasons.length === 0 && section === "overview" && (
        <Panel title="NO MAJOR-LEAGUE SEASONS">
          <p className="text-xs text-ink-3">
            MLB HAS NO MAJOR-LEAGUE LINE ON RECORD FOR THIS PLAYER.
          </p>
        </Panel>
      )}
      {/* Keyed on the view, so switching re-suspends into the skeleton rather
          than holding the last section on screen. */}
      <Suspense
        key={`${section}-${season}-${group}-${gameType}-${career}`}
        fallback={<TabSkeleton tab={section as PlayerTab} />}
      >
        <TabBody
          tab={section as PlayerTab}
          player={player}
          season={season}
          career={career}
          group={group}
          groups={groups}
          gameType={gameType}
          controls={controls}
        />
      </Suspense>
    </div>
  );
}
