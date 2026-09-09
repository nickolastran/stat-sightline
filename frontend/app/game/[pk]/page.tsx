import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import ScrollToTop from "@/components/ScrollToTop";
import AutoRefresh from "@/components/mlb/AutoRefresh";
import GameSkeleton from "@/components/mlb/GameSkeleton";
import BoxScoreView, { FullBox, NoBoxYet } from "@/components/mlb/BoxScoreView";
import LiveGame, {
  PlayByPlay,
  ScoringSummary,
  Situation,
  REFRESH_SECONDS,
} from "@/components/mlb/LiveGame";
import ParamTabs from "@/components/mlb/ParamTabs";
import Pregame from "@/components/mlb/Pregame";
import {
  getBoxScore,
  getGame,
  getLive,
  inProgress,
  notStarted,
  type BoxScore,
  type Game,
} from "@/lib/mlb";

/* A game being played is three views over one payload, one at a time. */
const TABS = [
  { value: "gamecast", label: "GAMECAST" },
  { value: "box", label: "BOX SCORE" },
  { value: "plays", label: "PLAY-BY-PLAY" },
];

/* The play log reads either way round — everything, or just the runs. */
const LOGS = [
  { value: "all", label: "ALL PLAYS" },
  { value: "scoring", label: "SCORING PLAYS" },
];

/* Only the gamecast earns the wide page — its three columns need it. The box
   score and the play log are the width they always were. */
const NARROW = "mx-auto max-w-5xl space-y-2";

/**
 * Whichever view the tabs are on. It owns the live feed rather than the page,
 * so the header and the tab strip render as soon as the schedule row lands and
 * only this streams in behind its own skeleton.
 */
async function GamePane({
  game,
  box,
  tab,
  log,
}: {
  game: Game;
  box: BoxScore;
  tab: string;
  log: string;
}) {
  const live = await getLive(game.pk).catch(() => null);
  const plays = live?.plays ?? [];

  if (tab === "gamecast")
    return <LiveGame game={game} box={box} live={live} />;

  return (
    <div className={NARROW}>
      {/* The gamecast carries the matchup in its own panel; the other two get
          it as a strip so the game is still readable. Once it is over there is
          no matchup to carry — the decisions on the card say how it ended. */}
      {inProgress(game) && <Situation box={box} live={live} />}
      {tab === "box" ? (
        <>
          <FullBox box={box} />
          <ScoringSummary plays={plays} />
        </>
      ) : (
        <PlayByPlay
          game={game}
          plays={plays}
          scoringOnly={log === "scoring"}
          tabs={
            <ParamTabs
              param="log"
              value={log}
              options={LOGS}
              ariaLabel="Which plays"
            />
          }
        />
      )}
    </div>
  );
}

/*
 * One game's box score as its own page — the target of every card in the
 * scoreboard rail. Schedule row (records, status, venue) and box score are
 * separate MLB endpoints, so both are pulled here in parallel and handed to
 * the view whole; a dead source degrades to a notice rather than throwing.
 */

async function load(pk: number) {
  return Promise.all([getGame(pk), getBoxScore(pk)]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pk: string }>;
}): Promise<Metadata> {
  const { pk } = await params;
  const game = await getGame(Number(pk)).catch(() => null);
  return {
    title: game
      ? `${game.away.abbr} @ ${game.home.abbr} — STAT//SIGHTLINE`
      : "STAT//SIGHTLINE",
  };
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ pk: string }>;
  searchParams: Promise<{ tab?: string; log?: string }>;
}) {
  const { pk } = await params;
  if (!/^\d+$/.test(pk)) notFound();

  let game, box;
  try {
    [game, box] = await load(Number(pk));
  } catch {
    return (
      <div className="mx-auto max-w-[96rem] p-3">
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          BOX SCORE UNAVAILABLE — MLB API UNREACHABLE
        </p>
      </div>
    );
  }
  if (!game) notFound();

  const playing = inProgress(game);
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "gamecast";
  const log = sp.log === "scoring" ? "scoring" : "all";
  const noLines =
    box.away.batters.length === 0 && box.home.batters.length === 0;
  /* Any game with lines reads through the three views, over or not: the
     gamecast still tells the story, and the box and the log are the same
     tables either way. */
  const tabbed = !notStarted(game) && !noLines;

  return (
    <div className="mx-auto max-w-[96rem] space-y-2 p-3">
      <ScrollToTop />
      <div className={NARROW}>
        <BoxScoreView game={game} box={box}>
          {/* Any game with lines puts its box behind the tabs below; one
            without them says so on the card. */}
          {tabbed || notStarted(game) ? null : <NoBoxYet game={game} />}
        </BoxScoreView>
      </div>

      {/* The buttons start where the card above them does either way; the
          rule under them runs the width of the view below — the whole bento on
          the gamecast, the card on the two that read at the card's width. On
          the gamecast that means insetting the buttons rather than the strip,
          so the rule still reaches the left box. */}
      {tabbed && (
        <>
          {playing && <AutoRefresh seconds={REFRESH_SECONDS} />}
          <div className={tab === "gamecast" ? "" : NARROW}>
            <ParamTabs
              param="tab"
              value={tab}
              options={TABS}
              ariaLabel="Game view"
              size="lg"
              variant="underline"
              className={
                tab === "gamecast" ? "pl-[max(0px,calc((100%-64rem)/2))]" : ""
              }
            />
          </div>
        </>
      )}

      {/* Keyed on the tab so switching re-suspends into that view's own
          skeleton rather than holding the last one, and its entrance replays. */}
      {tabbed && (
        <div key={tab} className="pane">
          <Suspense fallback={<GameSkeleton tab={tab} />}>
            <GamePane game={game} box={box} tab={tab} log={log} />
          </Suspense>
        </div>
      )}

      {/* Like the gamecast, the pre-game bento earns the full width — only the
          card above it reads at the card's width. */}
      {notStarted(game) && <Pregame game={game} />}
    </div>
  );
}
