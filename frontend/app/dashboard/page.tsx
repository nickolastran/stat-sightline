import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import Standings from "@/components/mlb/Standings";
import Leaderboards from "@/components/mlb/Leaderboards";
import PlayerSearch from "@/components/landing/PlayerSearch";
import { teamLogo } from "@/lib/mlb";
import {
  getSchedule,
  getStandings,
  getLeaderboards,
  todayET,
  seasonOf,
  type Game,
  type Division,
  type Leaderboard,
} from "@/lib/mlb";

/*
 * League overview: today's scoreboard, probable pitchers, standings, and
 * season stat leaders — all from the MLB Stats API, fetched server-side.
 * allSettled keeps one failing source from blanking the whole page.
 */
export default async function DashboardPage() {
  const date = todayET();
  const season = seasonOf(date);

  const [sched, stand, boards] = await Promise.allSettled([
    getSchedule(date),
    getStandings(season),
    getLeaderboards(season, 5),
  ]);

  const games: Game[] = sched.status === "fulfilled" ? sched.value : [];
  const divisions: Division[] = stand.status === "fulfilled" ? stand.value : [];
  const leaderboards: Leaderboard[] =
    boards.status === "fulfilled" ? boards.value : [];

  const live = games.filter((g) => g.state === "Live").length;
  const final = games.filter((g) => g.state === "Final").length;
  const probables = games.filter((g) => g.away.probable || g.home.probable);

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      {/* ── Header + player search ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-3 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-bold tracking-wide">LEAGUE OVERVIEW</h1>
          <span className="text-[11px] text-ink-3">
            {date} · SEASON {season}
          </span>
        </div>
        <div className="w-full sm:w-72">
          <PlayerSearch size="compact" placeholder="SEARCH PITCHER →" />
        </div>
      </div>

      {/* ── Snapshot metrics ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        <MetricCard label="GAMES TODAY" value={String(games.length)} sub={date} />
        <MetricCard label="LIVE NOW" value={String(live)} sub="IN PROGRESS" />
        <MetricCard label="FINAL" value={String(final)} sub="COMPLETED" />
        <MetricCard
          label="PROBABLES SET"
          value={String(probables.length)}
          sub="ANNOUNCED MATCHUPS"
        />
      </div>

      {/* ── Probable pitchers ──────────────────────────────────── */}
      {probables.length > 0 && (
        <Panel title="PROBABLE PITCHERS — TODAY">
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
        </Panel>
      )}

      {/* ── Standings ──────────────────────────────────────────── */}
      <Panel title="STANDINGS — BY DIVISION">
        <Standings divisions={divisions} />
      </Panel>

      {/* ── Leaderboards ───────────────────────────────────────── */}
      <Panel title="STAT LEADERS">
        <Leaderboards boards={leaderboards} />
      </Panel>
    </div>
  );
}

/* Probable-pitcher cell for one side of a matchup. */
function Prob({
  side,
  alignRight = false,
}: {
  side: Game["away"];
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
