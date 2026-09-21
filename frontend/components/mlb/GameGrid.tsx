import GameCard from "@/components/mlb/GameCard";
import { sortGames, type Game } from "@/lib/mlb";

/*
 * The whole day's slate on one page — the scoreboard strip's rail unrolled
 * into a grid. The card in its full form: line score, pitchers of record, and
 * the two ways into the game, which is why the card isn't wrapped in a link
 * of its own.
 *
 * Two to a row rather than three, so each card has the width its line score
 * and decisions need.
 */
export default function GameGrid({
  games,
  lines,
}: {
  games: Game[];
  /** Each pitcher of record's line, keyed `${gamePk}:${pitcherId}`. */
  lines?: Map<string, string>;
}) {
  if (games.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO GAMES ON THIS DATE
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {sortGames(games).map((g) => (
        <GameCard key={g.pk} game={g} detailed full lines={lines} />
      ))}
    </div>
  );
}
