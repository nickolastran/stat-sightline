import { getSchedule, todayET } from "@/lib/mlb";

/*
 * Same-origin proxy for the schedule so the client scoreboard bar can fetch
 * without hitting statsapi cross-origin. Reuses lib/mlb's server fetch, which
 * already caches (revalidate 60s).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("date");
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayET();
  try {
    const games = await getSchedule(date);
    return Response.json({ date, games });
  } catch {
    return Response.json({ date, games: [], error: true }, { status: 502 });
  }
}
