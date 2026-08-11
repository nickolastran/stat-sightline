import Link from "next/link";
import GameCard from "@/components/mlb/GameCard";
import { sortGames, type Game } from "@/lib/mlb";

/*
 * The whole day's slate on one page — the scoreboard strip's rail unrolled
 * into a grid. Same card in its detailed form (probables + venue), each one
 * opening that game's box score, which carries the Gameday link itself.
 */
export default function GameGrid({ games }: { games: Game[] }) {
  if (games.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO GAMES ON THIS DATE
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sortGames(games).map((g) => (
        <Link
          key={g.pk}
          href={`/game/${g.pk}`}
          aria-label={`Box score — ${g.away.name} at ${g.home.name}`}
          className="block focus-visible:outline-2 focus-visible:outline-accent"
        >
          <GameCard game={g} detailed className="hover:border-accent" />
        </Link>
      ))}
    </div>
  );
}
