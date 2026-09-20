import Link from "next/link";
import GameStatus from "@/components/mlb/GameStatus";
import {
  getArmIdentities,
  getPitcherLog,
  playerHeadshot,
  seasonOf,
  sortGames,
  sumStatLines,
  teamLogo,
  teamStatNum,
  teamStatText,
  type ArmGame,
  type ArmIdentity,
  type Game,
  type GameSide,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * Announced starting-pitcher matchups for a slate — one card per game, each
 * card a link to that game's preview. Shared by the dashboard page and the
 * league bar's dropdown so both read identically.
 *
 * A starter is read twice: the season he is having, and what he has done to
 * the club in the other dugout over his career. Both come out of the same
 * request — his career game log, summed two ways — so a card of two boxes
 * costs one call per announced arm.
 */

type Line = Record<string, TeamStatValue>;

/**
 * Games with at least one side's starter announced — the count the dashboard
 * reports. The list below shows the whole slate regardless, since a matchup
 * nobody has named a starter for is still a matchup being played today.
 */
export const probableGames = (games: Game[]) =>
  games.filter((g) => g.away.probable || g.home.probable);

/* The six numbers a matchup is read on. Rates are worked out from the totals
   the log was summed into, since a percentage of batters faced is not a
   column MLB publishes. */
const pct = (n: TeamStatValue, of: TeamStatValue): string => {
  const [a, b] = [teamStatNum(n), teamStatNum(of)];
  return a === null || !b ? "—" : `${((a / b) * 100).toFixed(1)}%`;
};

const COLS: [string, (l: Line) => string][] = [
  ["G", (l) => teamStatText(l.gamesPlayed)],
  ["ERA", (l) => teamStatText(l.era)],
  ["K%", (l) => pct(l.strikeOuts, l.battersFaced)],
  ["BB%", (l) => pct(l.baseOnBalls, l.battersFaced)],
  ["AVG", (l) => teamStatText(l.avg)],
  ["W-L", (l) => `${teamStatNum(l.wins) ?? 0}-${teamStatNum(l.losses) ?? 0}`],
];

function StatBox({ title, line }: { title: string; line: Line | null }) {
  return (
    <div className="border border-line bg-bg">
      <p className="border-b border-line bg-surface px-2 py-1 text-[10px] tracking-widest text-ink-3">
        {title}
      </p>
      {line ? (
        <div className="grid grid-cols-6">
          {COLS.map(([label, read]) => (
            <div key={label} className="border-l border-grid px-1 py-1.5 text-center first:border-l-0">
              <p className="text-[9px] tracking-wider text-ink-3">{label}</p>
              <p className="text-xs tabular-nums text-ink">{read(line)}</p>
            </div>
          ))}
        </div>
      ) : (
        /* Never having faced them is a fact about the matchup, not a missing
           number — it says so rather than printing a row of zeros. */
        <p className="px-2 py-3 text-center text-[10px] tracking-widest text-ink-3">
          NO RECORD AGAINST THEM
        </p>
      )}
    </div>
  );
}

/* One starter: who he is, the season he is having, and the club he faces. */
function Arm({
  side,
  opponent,
  season,
  id,
  log,
}: {
  side: GameSide;
  opponent: GameSide;
  season: number;
  id: ArmIdentity | undefined;
  log: ArmGame[] | null;
}) {
  const p = side.probable;
  const sum = (games: ArmGame[]) =>
    games.length ? sumStatLines("pitching", games.map((g) => g.stat)) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p ? playerHeadshot(p.id, 120) : teamLogo(side.id)}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-ink">
            {p?.name ?? "TBA"}
          </p>
          <p className="mt-0.5 truncate text-[10px] tracking-[0.2em] text-ink-3">
            {[
              side.abbr,
              id?.number && `#${id.number}`,
              id?.throws && `THROWS ${id.throws}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <StatBox
        title={`${season} SEASON`}
        line={log && sum(log.filter((g) => g.season === season))}
      />
      <StatBox
        title={`CAREER VS ${opponent.abbr}`}
        line={log && sum(log.filter((g) => g.opponentId === opponent.id))}
      />
    </div>
  );
}

export default async function ProbablePitchers({ games }: { games: Game[] }) {
  if (games.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO GAMES SCHEDULED FOR TODAY
      </p>
    );

  const slate = sortGames(games);
  const season = seasonOf(slate[0].startTime);
  const arms = slate.flatMap((g) =>
    [g.away.probable, g.home.probable].filter((p) => p !== null),
  );

  const [ids, logs] = await Promise.all([
    getArmIdentities(arms.map((p) => p.id)).catch(
      () => ({}) as Record<number, ArmIdentity>,
    ),
    Promise.all(
      arms.map((p) => getPitcherLog(p.id, season).catch(() => null)),
    ).then((rows) => new Map(arms.map((p, i) => [p.id, rows[i]]))),
  ]);

  const armOf = (side: GameSide, opponent: GameSide) => (
    <Arm
      side={side}
      opponent={opponent}
      season={season}
      id={side.probable ? ids[side.probable.id] : undefined}
      log={side.probable ? (logs.get(side.probable.id) ?? null) : null}
    />
  );

  return (
    <div className="space-y-2">
      {slate.map((g) => (
        <Link
          key={g.pk}
          href={`/game/${g.pk}`}
          className="block border border-line bg-bg p-3 hover:bg-surface-2"
        >
          <div className="mb-3 flex items-center justify-center gap-2 border-b border-grid pb-2 text-[10px] tracking-widest text-ink-3">
            <span className="font-bold text-ink">
              {g.away.abbr} @ {g.home.abbr}
            </span>
            <GameStatus game={g} />
            {g.venue && <span className="truncate">· {g.venue}</span>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {armOf(g.away, g.home)}
            {armOf(g.home, g.away)}
          </div>
        </Link>
      ))}
    </div>
  );
}
