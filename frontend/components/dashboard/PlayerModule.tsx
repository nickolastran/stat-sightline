import Link from "next/link";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getPlayerPitches, searchPitchers, type Role } from "@/lib/api";

/*
 * Pitch-level analysis tool, behind /pitcher/[id] and /hitter/[id]. Resolve
 * the player — the route id, or the highest-workload player in the role when
 * id is non-numeric — pull their full pitch payload once, and hand it to the
 * client shell, which does all filtering in memory.
 */
export default async function PlayerModule({
  role,
  id,
}: {
  role: Role;
  id: string;
}) {
  try {
    let playerId = Number(id);
    if (!Number.isFinite(playerId)) {
      const top = await searchPitchers("", 1, undefined, role);
      if (top.length === 0) throw new Error(`no ${role}s in warehouse`);
      playerId = top[0].player_id;
    }
    const data = await getPlayerPitches(role, playerId, { limit: 10000 });
    return <DashboardClient role={role} data={data} />;
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
            The pitch warehouse didn&apos;t answer. It&apos;s usually
            momentary; try again.
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
