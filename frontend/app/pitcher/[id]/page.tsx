import Link from "next/link";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getPitcherPitches, searchPitchers } from "@/lib/api";

/*
 * Pitch-level analysis tool (formerly at /dashboard). Resolve the pitcher —
 * the route id, or the highest-workload pitcher when id is non-numeric —
 * pull their full pitch payload once, and hand it to the client shell, which
 * does all filtering in memory.
 */
export default async function PitcherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    let pitcherId = Number(id);
    if (!Number.isFinite(pitcherId)) {
      const top = await searchPitchers("", 1);
      if (top.length === 0) throw new Error("no pitchers in warehouse");
      pitcherId = top[0].player_id;
    }
    const data = await getPitcherPitches(pitcherId, { limit: 10000 });
    return <DashboardClient data={data} />;
  } catch (e) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <div className="border border-crit bg-surface p-6">
          <h1 className="text-sm font-bold tracking-widest text-crit">
            [ERR] DATA SOURCE UNAVAILABLE
          </h1>
          <p className="mt-3 text-xs leading-5 text-ink-2">
            {(e as Error).message}
          </p>
          <p className="mt-3 text-xs leading-5 text-ink-3">
            Check that the API is up (uvicorn api.main:app --port 8000) and the
            warehouse is seeded (scripts/run_etl.py).
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
