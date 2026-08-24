import { teamLogo, type Game, type GameSide } from "@/lib/mlb";
import GameStatus from "@/components/mlb/GameStatus";

/*
 * One game in the scoreboard. `detailed` adds probable pitchers + venue for
 * the games/schedule page; the compact form is used in the dashboard strip.
 * Presentational only — the scoreboard strip wraps it in the button that
 * opens the box score.
 */

function TeamRow({
  s,
  live,
  detailed,
  upcoming,
}: {
  s: GameSide;
  live: boolean;
  detailed: boolean;
  /** First pitch is still ahead, so an unnamed starter is one still to come. */
  upcoming: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(s.id)}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0"
      />
      <span
        className={`min-w-0 flex-1 truncate text-xs ${
          s.isWinner ? "font-bold text-ink" : "text-ink-2"
        }`}
      >
        {s.abbr !== "—" ? s.abbr : s.name}
        {s.wins !== null && (
          <span className="ml-1.5 text-[10px] text-ink-3">
            {s.wins}-{s.losses}
          </span>
        )}
      </span>
      {/* A game already under way says nothing rather than "TBA": there is
          nothing left to announce once the starter has thrown a pitch. */}
      {detailed && (s.probable || upcoming) && (
        <span className="hidden truncate text-[10px] text-ink-3 sm:block">
          {s.probable?.name ?? "TBA"}
        </span>
      )}
      <span
        className={`w-6 text-right text-sm tabular-nums ${
          s.isWinner ? "font-bold text-ink" : live ? "text-ink" : "text-ink-2"
        }`}
      >
        {s.score ?? "—"}
      </span>
    </div>
  );
}

export default function GameCard({
  game,
  detailed = false,
  className = "",
}: {
  game: Game;
  detailed?: boolean;
  className?: string;
}) {
  const live = game.state === "Live";
  const upcoming = game.state === "Preview";

  return (
    <div className={`border border-line bg-bg p-2 ${className}`}>
      <div className="mb-1 flex items-center justify-between">
        <GameStatus game={game} />
        {detailed && game.venue && (
          <span className="hidden truncate text-[10px] text-ink-3 sm:block">
            {game.venue}
          </span>
        )}
      </div>
      <TeamRow s={game.away} live={live} detailed={detailed} upcoming={upcoming} />
      <TeamRow s={game.home} live={live} detailed={detailed} upcoming={upcoming} />
    </div>
  );
}
