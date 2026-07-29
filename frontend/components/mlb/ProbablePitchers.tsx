import { teamLogo, type Game, type GameSide } from "@/lib/mlb";

/*
 * Announced starting-pitcher matchups for a slate. Presentational — the
 * caller supplies the day's games. Shared by the dashboard page and the
 * league bar's dropdown so both read identically.
 */

/** Games with at least one side's starter announced. */
export const probableGames = (games: Game[]) =>
  games.filter((g) => g.away.probable || g.home.probable);

/* One side of a matchup: logo, team abbr, starter. */
function Prob({
  side,
  alignRight = false,
}: {
  side: GameSide;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        alignRight ? "flex-row-reverse text-right" : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(side.id)}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0"
      />
      <div className="min-w-0">
        <p className="truncate font-bold text-ink">{side.abbr}</p>
        <p className="truncate text-[10px] text-ink-3">
          {side.probable?.name ?? "TBD"}
        </p>
      </div>
    </div>
  );
}

export default function ProbablePitchers({ games }: { games: Game[] }) {
  const probables = probableGames(games);

  if (probables.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO PROBABLE PITCHERS ANNOUNCED FOR TODAY
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {probables.map((g) => (
        <div
          key={g.pk}
          className="flex items-center justify-between gap-3 border border-line bg-bg px-3 py-2 text-xs"
        >
          <Prob side={g.away} />
          <span className="shrink-0 text-[10px] text-ink-3">@</span>
          <Prob side={g.home} alignRight />
        </div>
      ))}
    </div>
  );
}
