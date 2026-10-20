import Link from "next/link";
import DashboardClient, { type Hitting } from "@/components/dashboard/DashboardClient";
import {
  getPlayerPitches,
  searchPitchers,
  type PitcherPitches,
  type Role,
} from "@/lib/api";
import { getPlayer, mlb, seasonOf, todayPT } from "@/lib/mlb";
import { getBatTracking } from "@/lib/batTracking";
import { getHomePark } from "@/lib/spray";
import { getSeasonPitches } from "@/lib/statcast";

/*
 * Pitch-level analysis tool, behind /pitcher/[id] and /hitter/[id]. Resolve
 * the player — the route id, or the highest-workload player in the role when
 * id is non-numeric — pull their full pitch payload once, and hand it to the
 * client shell, which does all filtering in memory.
 *
 * The warehouse API answers locally; the deployed site has none, so there the
 * same payload is built from Savant's Statcast search (the player pages' own
 * source) and MLB's people and leaders endpoints.
 */

/** The season's workload leader in a role, off MLB's leaderboard. */
async function topPlayer(role: Role, season: number): Promise<number> {
  const cat = role === "pitcher" ? "inningsPitched&statGroup=pitching" : "plateAppearances&statGroup=hitting";
  const data = await mlb(
    `/stats/leaders?leaderCategories=${cat}&season=${season}&sportId=1&limit=1`,
    86400,
  );
  const id = data.leagueLeaders?.[0]?.leaders?.[0]?.person?.id;
  if (!id) throw new Error(`no ${role} leader for ${season}`);
  return id;
}

/** The warehouse's payload, rebuilt off Savant: the latest season with any
 *  located pitches — last year's, before this one has begun. */
async function fromSavant(role: Role, id: string): Promise<PitcherPitches> {
  const current = seasonOf(todayPT());
  for (const season of [current, current - 1]) {
    const playerId = Number.isFinite(Number(id)) ? Number(id) : await topPlayer(role, season);
    const [rows, person] = await Promise.all([
      getSeasonPitches(playerId, season, role),
      getPlayer(playerId, season),
    ]);
    if (!person) throw new Error(`no such player ${playerId}`);
    const pitches = rows.filter((p) => p.plate_x !== null && p.plate_z !== null);
    if (pitches.length === 0 && season === current) continue;
    return {
      pitcher: {
        player_id: playerId,
        full_name: person.name,
        throws: person.throws,
        bats: person.bats,
        pitches: pitches.length,
      },
      count: pitches.length,
      pitches,
    };
  }
  throw new Error(`no pitches for ${role} ${id}`);
}

/**
 * What only the Hitting module draws and a slice can't supply: the season's
 * bat-tracking line beside the league's, and the hitter's home park to lay
 * the spray chart in. Either missing is that panel's notice, not an error.
 */
async function hittingFor(data: PitcherPitches): Promise<Hitting> {
  const last = data.pitches.reduce(
    (m, p) => (p.game_date && p.game_date > m ? p.game_date : m),
    "",
  );
  const season = last ? seasonOf(last) : seasonOf(todayPT());
  const id = data.pitcher.player_id;
  const [bat, person] = await Promise.all([
    getBatTracking(id, season).catch(() => null),
    getPlayer(id, season).catch(() => null),
  ]);
  const park = person?.teamId ? await getHomePark(person.teamId).catch(() => null) : null;
  return { season, bat, park };
}

/** The warehouse when it answers, Savant when it doesn't. */
async function loadPitches(role: Role, id: string): Promise<PitcherPitches> {
  try {
    let playerId = Number(id);
    if (!Number.isFinite(playerId)) {
      const top = await searchPitchers("", 1, undefined, role);
      if (top.length === 0) throw new Error(`no ${role}s in warehouse`);
      playerId = top[0].player_id;
    }
    return await getPlayerPitches(role, playerId, { limit: 10000 });
  } catch {
    return fromSavant(role, id);
  }
}

export default async function PlayerModule({
  role,
  id,
}: {
  role: Role;
  id: string;
}) {
  try {
    const data = await loadPitches(role, id);
    const hitting = role === "batter" ? await hittingFor(data) : undefined;
    return <DashboardClient role={role} data={data} hitting={hitting} />;
  } catch (e) {
    // The cause goes to the server log; the page only says it's momentary.
    console.error(e);
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <div className="border border-crit bg-surface p-6">
          <h1 className="text-sm font-bold tracking-widest text-crit">
            [ERR] DATA SOURCE UNAVAILABLE
          </h1>
          <p className="mt-3 text-xs leading-5 text-ink-2">
            Neither the pitch warehouse nor Baseball Savant answered.
            It&apos;s usually momentary; try again.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
          >
            ← BACK TO DASHBOARD
          </Link>
        </div>
      </div>
    );
  }
}
