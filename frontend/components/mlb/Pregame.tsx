import DivisionTable from "@/components/mlb/DivisionTable";
import FirstPitch from "@/components/mlb/FirstPitch";
import LineupCard from "@/components/mlb/LineupCard";
import Panel from "@/components/ui/Panel";
import ResultTable from "@/components/mlb/ResultTable";
import SeriesPanel from "@/components/mlb/SeriesPanel";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLeaders from "@/components/mlb/TeamLeaders";
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

/* ── Matchup predictor ──────────────────────────────────────────────── */

const R = 52;
const C = 2 * Math.PI * R;

function Donut({ game, odds }: { game: Game; odds: { home: number; away: number } }) {
  const homeFavoured = odds.home >= odds.away;
  /* Away sweeps counter-clockwise (mirrored), home clockwise, so each team's
     arc sits on the same side as its percentage. */
  const arc = (frac: number, favoured: boolean, mirrored: boolean) => (
    <circle
      cx="70"
      cy="70"
      r={R}
      fill="none"
      strokeWidth="16"
      className={favoured ? "stroke-ink" : "stroke-grid"}
      strokeDasharray={`${frac * C} ${C}`}
      transform={
        mirrored
          ? "translate(140 0) scale(-1 1) rotate(-90 70 70)"
          : "rotate(-90 70 70)"
      }
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
        {arc(odds.away, !homeFavoured, true)}
        {arc(odds.home, homeFavoured, false)}
        <line x1="70" y1="54" x2="70" y2="90" className="stroke-line" strokeWidth="2" />
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
    getTeamLeaders(game.away.id, season, "R", true).catch(() => null),
    getTeamLeaders(game.home.id, season, "R", true).catch(() => null),
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

  const last5 = (schedule: Game[] | null) =>
    (schedule ?? []).filter((g) => g.state === "Final").slice(-RECENT).reverse();

  const divisionOf = (id: number) =>
    standings?.find((d) => d.teams.some((t) => t.id === id)) ?? null;

  return (
    /* The gamecast layout, before there is a game to cast: two rails sized to
       what they carry, and the middle taking whatever is left. Below the
       breakpoint the three stack at the full width of the page. */
    <div className="mt-3 grid grid-cols-1 gap-2 min-[1440px]:grid-cols-[28rem_minmax(0,1fr)_28rem]">
      <div className="space-y-2">
        <Panel title="MATCHUP PREDICTOR">
          {odds ? (
            <Donut game={game} odds={odds} />
          ) : (
            <Notice what="NO RECORDS TO CALL IT ON YET" />
          )}
        </Panel>


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
      </div>

      <div className="space-y-2">
        <Panel title="PROBABLE PITCHERS">
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

        {awayLeaders && homeLeaders ? (
          <TeamLeaders
            away={awayLeaders}
            home={homeLeaders}
            awayAbbr={game.away.abbr}
            homeAbbr={game.home.abbr}
          />
        ) : (
          <Panel title="TEAM LEADERS">
            <Notice what="LEADERS UNAVAILABLE — MLB API UNREACHABLE" />
          </Panel>
        )}
      </div>

      {/* Where this game sits in the season: the clubs' own series, and the
          race each of them is in. One table when they share a division — a
          race read twice is not two races. */}
      <div className="space-y-2">
        <SeriesPanel
          teamId={game.away.id}
          awayAbbr={game.away.abbr}
          homeAbbr={game.home.abbr}
          series={series}
          matchups={matchups}
          label={
            pre?.series?.result ||
            (pre?.series ? `GAME ${pre.series.game} OF ${pre.series.total}` : "")
          }
        />

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
                full
              />
            ) : (
              <Panel key={s.id} title={`${s.abbr} STANDINGS`}>
                <Notice what="NO STANDINGS FOR THIS SEASON YET" />
              </Panel>
            );
          })}
      </div>
    </div>
  );
}
