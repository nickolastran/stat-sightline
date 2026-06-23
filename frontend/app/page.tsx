import Link from "next/link";
import { searchPitchers } from "@/lib/api";

export default async function Home() {
  // Server component: list the busiest pitchers as entry points.
  let pitchers: Awaited<ReturnType<typeof searchPitchers>> = [];
  let error: string | null = null;
  try {
    pitchers = await searchPitchers("");
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold">Pitchers</h2>
      {error && (
        <p className="rounded bg-red-500/10 p-3 text-sm text-red-300">
          Could not reach the API ({error}). Is uvicorn running on :8000?
        </p>
      )}
      <ul className="divide-y divide-white/10">
        {pitchers.map((p) => (
          <li key={p.player_id}>
            <Link
              href={`/pitcher/${p.player_id}`}
              className="flex items-center justify-between py-3 hover:text-sky-400"
            >
              <span>{p.full_name ?? `#${p.player_id}`}</span>
              <span className="text-sm text-slate-400">
                {p.throws ?? "?"}HP · {p.pitches?.toLocaleString()} pitches
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
