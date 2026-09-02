import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GameCard from "@/components/mlb/GameCard";
import PlayerLink from "@/components/mlb/PlayerLink";
import DivisionTable from "@/components/mlb/DivisionTable";
import TeamStatCard from "@/components/mlb/TeamStatCard";
import {
  getTeamCardStats,
  getTeamLeaders,
  getTeamSchedule,
  getStandings,
  type Game,
  type TeamLeaderBoard,
} from "@/lib/mlb";

/*
 * The club's front page: how the last week went, where it sits in its
 * division, who leads it, and the four figures it is judged on with their
 * league rank. Every block is one cached request the rest of the site already
 * makes, so a whole page is cheaper than it looks — and each one degrades to
 * a notice on its own rather than taking the page down with it.
 */

const RECENT = 5;

function Notice({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what}
    </p>
  );
}

/* ── Recent games ───────────────────────────────────────────────────── */

function RecentGames({ games }: { games: Game[] }) {
  /* Played games if there are any, else the ones still to come — an April
     page and a November one both have something to show. */
  const played = games.filter((g) => g.state === "Final").slice(-RECENT);
  const shown = played.length
    ? played.reverse()
    : games.filter((g) => g.state !== "Final").slice(0, RECENT);

  return (
    <Panel title={played.length ? "RECENT GAMES" : "UPCOMING GAMES"}>
      {shown.length === 0 ? (
        <Notice what="NO GAMES ON THE SCHEDULE" />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {shown.map((g) => (
            <Link
              key={g.pk}
              href={`/game/${g.pk}`}
              aria-label={`Box score — ${g.away.name} at ${g.home.name}`}
              className="block focus-visible:outline-2 focus-visible:outline-accent"
            >
              <GameCard game={g} className="hover:border-accent" />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Team leaders ───────────────────────────────────────────────────── */

function TeamLeaders({
  boards,
  season,
}: {
  boards: TeamLeaderBoard[];
  season: number;
}) {
  const filled = boards.filter((b) => b.leaders.length > 0);

  return (
    <Panel title={`${season} TEAM LEADERS`}>
      {filled.length === 0 ? (
        <Notice what="NO LEADERS FOR THIS SEASON YET" />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filled.map((b) => (
            <div key={b.key} className="border border-line bg-bg">
              <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
                {b.label}
              </h3>
              <ul>
                {b.leaders.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      <PlayerLink id={l.id}>{l.name}</PlayerLink>
                    </span>
                    <span className="tabular-nums text-ink">{l.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── The tab ────────────────────────────────────────────────────────── */

export default async function TeamHome({
  id,
  season,
}: {
  id: number;
  season: number;
}) {
  const [schedule, standings, leaders, card] = await Promise.all([
    getTeamSchedule(id, season).catch(() => null),
    getStandings(season).catch(() => null),
    getTeamLeaders(id, season).catch(() => null),
    getTeamCardStats(id, season).catch(() => null),
  ]);

  const division =
    standings?.find((d) => d.teams.some((t) => t.id === id)) ?? null;

  return (
    <div className="space-y-3">
      {schedule ? (
        <RecentGames games={schedule} />
      ) : (
        <Panel title="RECENT GAMES">
          <Notice what="SCHEDULE UNAVAILABLE — MLB API UNREACHABLE" />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {division ? (
            <DivisionTable division={division} teamId={id} />
          ) : (
            <Panel title="DIVISION STANDINGS">
              <Notice what="NO STANDINGS FOR THIS SEASON YET" />
            </Panel>
          )}
          {leaders ? (
            <TeamLeaders boards={leaders} season={season} />
          ) : (
            <Panel title={`${season} TEAM LEADERS`}>
              <Notice what="LEADERS UNAVAILABLE — MLB API UNREACHABLE" />
            </Panel>
          )}
        </div>
        <div className="self-start">
          {card ? (
            <TeamStatCard
              season={season}
              hitting={card.hitting}
              pitching={card.pitching}
            />
          ) : (
            <Panel title={`${season} TEAM STATS`}>
              <Notice what="TEAM STATS UNAVAILABLE" />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
