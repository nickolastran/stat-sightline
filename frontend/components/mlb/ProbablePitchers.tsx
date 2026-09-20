import Link from "next/link";
import GameStatus from "@/components/mlb/GameStatus";
import {
  getArmIdentities,
  heat,
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

/* The six numbers a matchup is read on. The two rates are worked out from the
   totals the log was summed into, since a share of batters faced is not a
   column MLB publishes. */
const rate = (n: TeamStatValue, of: TeamStatValue): number | null => {
  const [a, b] = [teamStatNum(n), teamStatNum(of)];
  return a === null || !b ? null : (a / b) * 100;
};

/* Where the league sits (2026: 22.1% of batters faced struck out, 8.9%
   walked), and the swing off it that earns a fully saturated cell.

   Red is the pitcher's good end on both rows — the strikeouts he gets, the
   walks he doesn't — so the walk column is read upside down against the
   shared scale rather than colouring "more walks" the same way "more
   strikeouts" is coloured. */
const LEAGUE_K = 22.1;
const LEAGUE_BB = 8.9;
const K_SWING = 8;
const BB_SWING = 4;

/* A rate off two dozen hitters is noise, not a tendency, and shading it would
   paint a September call-up's one start as an ace. */
const HEAT_MIN_BF = 25;

/* `edge` is how far the rate sits on the pitcher's side of the league, so the
   shared scale's red always falls where he is beating it. */
const shade = (line: Line, edge: number | null, swing: number) =>
  edge === null || (teamStatNum(line.battersFaced) ?? 0) < HEAT_MIN_BF
    ? undefined
    : heat(edge, swing);

const COLS: {
  label: string;
  read: (l: Line) => string;
  heat?: (l: Line) => { backgroundColor: string } | undefined;
}[] = [
  { label: "G", read: (l) => teamStatText(l.gamesPlayed) },
  { label: "ERA", read: (l) => teamStatText(l.era) },
  {
    label: "K%",
    read: (l) => text(rate(l.strikeOuts, l.battersFaced)),
    heat: (l) => {
      const r = rate(l.strikeOuts, l.battersFaced);
      return shade(l, r === null ? null : r - LEAGUE_K, K_SWING);
    },
  },
  {
    label: "BB%",
    read: (l) => text(rate(l.baseOnBalls, l.battersFaced)),
    heat: (l) => {
      const r = rate(l.baseOnBalls, l.battersFaced);
      return shade(l, r === null ? null : LEAGUE_BB - r, BB_SWING);
    },
  },
  { label: "AVG", read: (l) => teamStatText(l.avg) },
  {
    label: "W-L",
    read: (l) => `${teamStatNum(l.wins) ?? 0}-${teamStatNum(l.losses) ?? 0}`,
  },
];

const text = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}%`);

function StatBox({ title, line }: { title: string; line: Line | null }) {
  return (
    <div className="border border-line bg-bg">
      <p className="border-b border-line bg-surface px-2 py-1 text-[10px] tracking-widest text-ink-3">
        {title}
      </p>
      {/* An unannounced starter, or one who has never faced them, keeps the
          box: the shape of the card is the same either way, with dashes where
          the numbers will be. */}
      <div className="grid grid-cols-6">
        {COLS.map((c) => (
          <div
            key={c.label}
            style={line ? c.heat?.(line) : undefined}
            className="border-l border-grid px-1 py-1.5 text-center first:border-l-0"
          >
            <p className="text-[9px] tracking-wider text-ink-3">{c.label}</p>
            <p className="text-xs tabular-nums text-ink">
              {line ? c.read(line) : "—"}
            </p>
          </div>
        ))}
      </div>
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
        {p ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={playerHeadshot(p.id, 240)}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 shrink-0"
          />
        ) : (
          /* Nobody named yet: the space he will fill, held open and blank. */
          <div className="h-24 w-24 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tracking-wide text-ink">
            {p?.name ?? "TBD"}
          </p>
          {/* Whose club he pitches for is already the line above, in logos
              the width of a thumbnail — it does not need saying twice. */}
          <p className="mt-1 truncate text-[11px] tracking-[0.2em] text-ink-3">
            {[id?.number && `#${id.number}`, id?.throws && `${id.throws}HP`]
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
          className="block border border-line bg-bg p-3"
        >
          <div className="mb-3 border-b border-grid pb-2 text-center">
            <p className="flex items-center justify-center gap-3">
              {[g.away, g.home].map((s, i) => (
                <span key={s.id} className="flex items-center gap-3">
                  {i === 1 && (
                    <span className="text-sm tracking-widest text-ink-3">@</span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={teamLogo(s.id)}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0"
                  />
                  <span className="text-lg font-bold tracking-wider text-ink">
                    {s.abbr}
                  </span>
                </span>
              ))}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-[10px] tracking-widest text-ink-3">
              <GameStatus game={g} />
              {g.venue && <span className="truncate">· {g.venue}</span>}
            </p>
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
