import DivisionTable from "@/components/mlb/DivisionTable";
import FirstPitch from "@/components/mlb/FirstPitch";
import LineupCard from "@/components/mlb/LineupCard";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import {
  FALLBACK_TZ,
  gameStatus,
  getPlayer,
  getPregame,
  getStandings,
  getTeamLeaders,
  getTeamPlayerStats,
  getTeamSchedule,
  getVsPitcher,
  headToHead,
  lineupSeason,
  seasonOf,
  seriesGames,
  teamLogo,
  winProbability,
  type Game,
  type GameSide,
  type PlayerSummary,
  type Pregame as PregameData,
  type TeamLeaderBoard,
} from "@/lib/mlb";

/*
 * Everything a game is worth reading before it starts, since there is no box
 * score to read yet: who is favoured and by how much, who is pitching and
 * hitting, what the two clubs have been doing, and what is at stake in the
 * series and the standings.
 *
 * Every block is one request the rest of the site already makes and caches —
 * the two clubs' schedules, their player stats, the standings — so the page
 * is cheaper than the number of panels suggests. Each one degrades to a
 * notice on its own rather than taking the page down.
 */

const RECENT = 5;

function Notice({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what}
    </p>
  );
}

/* Dates read in the game's own zone rather than the reader's: a schedule is
   a list of baseball days, and Eastern is the one they are numbered in. */
const gameDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(iso));

/* ── Matchup predictor ──────────────────────────────────────────────── */

const R = 52;
const C = 2 * Math.PI * R;

function Donut({ game, odds }: { game: Game; odds: { home: number; away: number } }) {
  const homeFavoured = odds.home >= odds.away;
  const arc = (frac: number, offset: number, favoured: boolean) => (
    <circle
      cx="70"
      cy="70"
      r={R}
      fill="none"
      strokeWidth="16"
      className={favoured ? "stroke-accent" : "stroke-grid"}
      strokeDasharray={`${frac * C} ${C}`}
      strokeDashoffset={-offset * C}
      transform="rotate(-90 70 70)"
    />
  );

  return (
    <div className="flex items-center justify-center gap-3">
      <p className="text-lg font-bold tabular-nums text-ink">
        {(odds.away * 100).toFixed(1)}%
      </p>
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img"
        aria-label={`${game.away.abbr} ${(odds.away * 100).toFixed(1)} percent, ${game.home.abbr} ${(odds.home * 100).toFixed(1)} percent`}
      >
        {arc(odds.away, 0, !homeFavoured)}
        {arc(odds.home, odds.away, homeFavoured)}
        {[game.away, game.home].map((s, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <image
            key={s.id}
            href={teamLogo(s.id)}
            x={i === 0 ? 38 : 74}
            y="58"
            width="28"
            height="28"
          />
        ))}
      </svg>
      <p className="text-lg font-bold tabular-nums text-ink">
        {(odds.home * 100).toFixed(1)}%
      </p>
    </div>
  );
}

/* ── Probable pitchers ──────────────────────────────────────────────── */

const PITCH_COLS = ["W-L", "ERA", "WHIP", "IP", "H", "K", "BB", "HR"];

function ProbableRow({ side, p }: { side: GameSide; p: PlayerSummary | null }) {
  const line = p?.lines.find((l) => l.group === "pitching");
  const stats = Object.fromEntries(line?.stats ?? []);
  return (
    <tr className="border-b border-grid last:border-b-0 hover:bg-surface-2">
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span className="mr-1.5 text-[10px] tracking-wider text-ink-3">
          {side.abbr}
        </span>
        <PlayerLink id={side.probable?.id}>
          {side.probable?.name ?? "TBA"}
        </PlayerLink>
        {p && (
          <span className="ml-1.5 text-[10px] text-ink-3">
            {p.throws}HP{p.number && ` #${p.number}`}
          </span>
        )}
      </td>
      {PITCH_COLS.map((c) => (
        <td key={c} className="px-2 py-1.5 text-right tabular-nums text-ink-2">
          {stats[c] ?? "—"}
        </td>
      ))}
    </tr>
  );
}

/* ── Team leaders, the two clubs side by side ───────────────────────── */

function LeaderRow({
  label,
  away,
  home,
}: {
  label: string;
  away: TeamLeaderBoard["leaders"][number] | undefined;
  home: TeamLeaderBoard["leaders"][number] | undefined;
}) {
  const cell = (l: typeof away, right: boolean) => (
    <td className={`px-2 py-1.5 ${right ? "text-right" : ""}`}>
      {l ? (
        <>
          <span className="block truncate">
            <PlayerLink id={l.id} headshot={false}>
              {l.name}
            </PlayerLink>
          </span>
          <span className="text-[10px] tabular-nums text-ink-3">{l.value}</span>
        </>
      ) : (
        <span className="text-ink-3">—</span>
      )}
    </td>
  );
  return (
    <tr className="border-b border-grid last:border-b-0">
      {cell(away, false)}
      <td className="px-2 py-1.5 text-center text-[10px] tracking-[0.2em] whitespace-nowrap text-ink-3">
        {label}
      </td>
      {cell(home, true)}
    </tr>
  );
}

/* ── Last five, and the season series ───────────────────────────────── */

function ResultTable({
  teamId,
  games,
  caption,
}: {
  teamId: number;
  games: Game[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-xs">
        <caption className="border-b border-line px-2 py-1.5 text-left text-[10px] tracking-[0.25em] text-ink-3">
          {caption}
        </caption>
        <thead>
          <tr>
            {["DATE", "OPP", "RESULT"].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`border-b border-line px-2 py-1.5 text-[10px] font-normal tracking-widest text-ink-3 ${
                  i === 2 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.length === 0 && (
            <tr>
              <td colSpan={3} className="px-2 py-4 text-center text-ink-3">
                NOTHING PLAYED YET
              </td>
            </tr>
          )}
          {games.map((g) => {
            const at = g.home.id === teamId;
            const us = at ? g.home : g.away;
            const them = at ? g.away : g.home;
            const done = g.state === "Final";
            return (
              <tr
                key={g.pk}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-2 py-1.5 whitespace-nowrap text-ink-3">
                  {gameDay(g.startTime)}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                  <span className="mr-1 text-[10px] text-ink-3">
                    {at ? "vs" : "@"}
                  </span>
                  <TeamLink id={them.id} name={them.abbr} className="inline-flex" />
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {done ? (
                    <>
                      <span
                        className={us.isWinner ? "font-bold text-good" : "text-crit"}
                      >
                        {us.isWinner ? "W" : "L"}
                      </span>{" "}
                      <span className="text-ink-2">
                        {us.score}-{them.score}
                      </span>
                    </>
                  ) : (
                    /* Eastern rather than the reader's zone: this table is
                       rendered on the server, and a mismatch at hydration is
                       worse than a zone they have to translate. */
                    <span className="text-ink-3">
                      {gameStatus(g, FALLBACK_TZ).text}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── The view ───────────────────────────────────────────────────────── */

export default async function Pregame({ game }: { game: Game }) {
  const season = seasonOf(game.startTime);
  const pre: PregameData | null = await getPregame(game.pk).catch(() => null);

  const [
    awayArm,
    homeArm,
    awayBats,
    homeBats,
    awayLeaders,
    homeLeaders,
    awaySchedule,
    homeSchedule,
    standings,
    awayVs,
    homeVs,
  ] = await Promise.all([
    game.away.probable ? getPlayer(game.away.probable.id, season).catch(() => null) : null,
    game.home.probable ? getPlayer(game.home.probable.id, season).catch(() => null) : null,
    getTeamPlayerStats(game.away.id, season, "hitting").catch(() => []),
    getTeamPlayerStats(game.home.id, season, "hitting").catch(() => []),
    getTeamLeaders(game.away.id, season).catch(() => null),
    getTeamLeaders(game.home.id, season).catch(() => null),
    getTeamSchedule(game.away.id, season).catch(() => null),
    getTeamSchedule(game.home.id, season).catch(() => null),
    getStandings(season).catch(() => null),
    /* A club's hitters are read against the arm they are facing — the other
       club's starter, not their own. */
    pre && game.home.probable
      ? getVsPitcher(pre.away.map((s) => s.id), game.home.probable.id).catch(() => ({}))
      : {},
    pre && game.away.probable
      ? getVsPitcher(pre.home.map((s) => s.id), game.away.probable.id).catch(() => ({}))
      : {},
  ]);

  const odds = winProbability(game);
  const matchups = awaySchedule ? headToHead(awaySchedule, game.home.id) : [];
  const series = seriesGames(matchups, game.pk);
  const played = matchups.filter((g) => g.state === "Final");
  const awayWins = played.filter(
    (g) => (g.home.id === game.away.id ? g.home : g.away).isWinner
  ).length;

  const last5 = (schedule: Game[] | null) =>
    (schedule ?? []).filter((g) => g.state === "Final").slice(-RECENT).reverse();

  const divisionOf = (id: number) =>
    standings?.find((d) => d.teams.some((t) => t.id === id)) ?? null;

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="MATCHUP PREDICTOR">
          {odds ? (
            <>
              <Donut game={game} odds={odds} />
              <p className="mt-2 text-center text-[10px] tracking-wider text-ink-3">
                SEASON RECORDS AND HOME FIELD — NOT THE STARTERS
              </p>
            </>
          ) : (
            <Notice what="NO RECORDS TO CALL IT ON YET" />
          )}
        </Panel>

        <Panel title="PROBABLE PITCHERS" className="lg:col-span-2">
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-line px-2 py-1.5 text-left text-[10px] font-normal tracking-widest text-ink-3"
                  >
                    PITCHER
                  </th>
                  {PITCH_COLS.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-b border-line px-2 py-1.5 text-right text-[10px] font-normal tracking-widest text-ink-3"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ProbableRow side={game.away} p={awayArm} />
                <ProbableRow side={game.home} p={homeArm} />
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="LINEUPS">
        {pre ? (
          <LineupCard
            away={{
              abbr: game.away.abbr,
              spots: pre.away,
              season: lineupSeason(awayBats),
              vs: awayVs,
              facing: game.home.probable?.name ?? "",
            }}
            home={{
              abbr: game.home.abbr,
              spots: pre.home,
              season: lineupSeason(homeBats),
              vs: homeVs,
              facing: game.away.probable?.name ?? "",
            }}
          />
        ) : (
          <Notice what="LINEUPS UNAVAILABLE — MLB API UNREACHABLE" />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="GAME INFORMATION">
          <dl className="space-y-1.5 text-xs">
            {[
              ["VENUE", game.venue || "—"],
              ["FIRST PITCH", <FirstPitch key="fp" startTime={game.startTime} />],
              [
                "WEATHER",
                pre?.weather
                  ? `${pre.weather.temp}° ${pre.weather.condition} · WIND ${pre.weather.wind}`
                  : "—",
              ],
              [
                "COVERAGE",
                pre?.broadcasts.length
                  ? pre.broadcasts.map((b) => b.name).join(" · ")
                  : "—",
              ],
              [
                "UMPIRES",
                pre?.officials.length
                  ? pre.officials.map((o) => `${o.role}: ${o.name}`).join(" · ")
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-2">
                <dt className="w-24 shrink-0 text-[10px] tracking-[0.2em] text-ink-3">
                  {label}
                </dt>
                <dd className="min-w-0 flex-1 text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title={`${season} TEAM LEADERS`} className="lg:col-span-2">
          {awayLeaders && homeLeaders ? (
            <div className="overflow-x-auto border border-line">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-line px-2 py-1.5 text-left text-[10px] font-normal tracking-widest text-ink-3">
                      {game.away.abbr}
                    </th>
                    <th scope="col" className="border-b border-line px-2 py-1.5 text-center text-[10px] font-normal tracking-widest text-ink-3">
                      &nbsp;
                    </th>
                    <th scope="col" className="border-b border-line px-2 py-1.5 text-right text-[10px] font-normal tracking-widest text-ink-3">
                      {game.home.abbr}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {awayLeaders.map((b, i) => (
                    <LeaderRow
                      key={b.key}
                      label={b.label}
                      away={b.leaders[0]}
                      home={homeLeaders[i]?.leaders[0]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Notice what="LEADERS UNAVAILABLE — MLB API UNREACHABLE" />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ResultTable
          teamId={game.away.id}
          games={last5(awaySchedule)}
          caption={`${game.away.abbr} LAST ${RECENT}`}
        />
        <ResultTable
          teamId={game.home.id}
          games={last5(homeSchedule)}
          caption={`${game.home.abbr} LAST ${RECENT}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          title="THIS SERIES"
          right={
            <span className="text-[10px] text-ink-3">
              {pre?.series?.result ||
                (pre?.series ? `GAME ${pre.series.game} OF ${pre.series.total}` : "")}
            </span>
          }
        >
          <div className="space-y-2">
            <ResultTable
              teamId={game.away.id}
              games={series}
              caption={`${game.away.abbr} AT ${game.home.abbr}`}
            />
            {played.length > 0 && (
              <p className="text-[10px] tracking-wider text-ink-3">
                SEASON SERIES — {game.away.abbr} {awayWins}, {game.home.abbr}{" "}
                {played.length - awayWins}
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-3 lg:col-span-2">
          {/* One table when the two clubs share a division — a race read twice
              is not two races. */}
          {[game.away, game.home]
            .filter(
              (s, i) => i === 0 || divisionOf(s.id)?.id !== divisionOf(game.away.id)?.id
            )
            .map((s) => {
              const division = divisionOf(s.id);
              return division ? (
                <DivisionTable
                  key={s.id}
                  division={division}
                  teamId={[game.away.id, game.home.id]}
                />
              ) : (
                <Panel key={s.id} title={`${s.abbr} STANDINGS`}>
                  <Notice what="NO STANDINGS FOR THIS SEASON YET" />
                </Panel>
              );
            })}
        </div>
      </div>
    </div>
  );
}
