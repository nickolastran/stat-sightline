import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BoxScoreView from "@/components/mlb/BoxScoreView";
import GameFeedLink from "@/components/mlb/GameFeedLink";
import LiveGame from "@/components/mlb/LiveGame";
import Pregame from "@/components/mlb/Pregame";
import { getBoxScore, getGame, inProgress, notStarted } from "@/lib/mlb";

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
}: {
  params: Promise<{ pk: string }>;
}) {
  const { pk } = await params;
  if (!/^\d+$/.test(pk)) notFound();

  let game, box;
  try {
    [game, box] = await load(Number(pk));
  } catch {
    return (
      <div className="mx-auto max-w-5xl p-3">
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          BOX SCORE UNAVAILABLE — MLB API UNREACHABLE
        </p>
      </div>
    );
  }
  if (!game) notFound();

  return (
    <div className="mx-auto max-w-5xl p-3">
      <BoxScoreView
        game={game}
        box={box}
        pregame={notStarted(game)}
        live={inProgress(game) ? <LiveGame game={game} box={box} /> : undefined}
        right={
          <GameFeedLink
            pk={game.pk}
            label={`${game.away.name} at ${game.home.name}`}
            className="h-7 w-7 shrink-0"
          />
        }
      />
      {notStarted(game) && <Pregame game={game} />}
    </div>
  );
}
