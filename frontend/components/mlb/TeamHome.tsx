import Panel from "@/components/ui/Panel";
import GameCard from "@/components/mlb/GameCard";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import TeamStatCard from "@/components/mlb/TeamStatCard";
import {
  gamesBack,
  getTeamCardStats,
  getTeamLeaders,
  getTeamSchedule,
  getStandings,
  type Division,
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
            <GameCard key={g.pk} game={g} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Division standings ─────────────────────────────────────────────── */

function DivisionStandings({
  division,
  teamId,
}: {
  division: Division;
  teamId: number;
}) {
  const gb = gamesBack(division.teams);
  const rows = [...division.teams].sort(
    (a, b) => Number(a.divRank) - Number(b.divRank)
  );

  return (
    <Panel
      title={`${division.name} STANDINGS`}
      right={
        <span className="text-[10px] text-ink-3">{division.league}</span>
      }
    >
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {["TEAM", "W", "L", "PCT", "GB", "L10", "STRK"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`border-b border-line bg-surface px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = r.id === teamId;
              return (
                <tr
                  key={r.id}
                  aria-current={mine ? "true" : undefined}
                  className={`border-b border-grid last:border-b-0 ${
                    mine
                      ? "bg-accent/15 font-bold text-ink"
                      : "text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <TeamLink id={r.id} name={r.name} />
                  </td>
                  {[
                    String(r.wins),
                    String(r.losses),
                    r.pct,
                    gb(r) === 0 ? "-" : gb(r).toFixed(1),
                    r.last10,
                    r.streak,
                  ].map((v, i) => (
                    <td
                      key={i}
                      className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
            <DivisionStandings division={division} teamId={id} />
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
  );
}
