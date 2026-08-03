"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/*
 * Season picker for the leader boards. The choice lives in the URL rather
 * than in component state, because the boards are fetched on the server:
 * picking a year is a navigation, so a season is linkable and the page
 * streams the new one in behind its own skeleton. `replace` keeps a browsing
 * session from stacking one history entry per year tried.
 */
export default function SeasonSelect({
  value,
  first,
  last,
}: {
  value: number;
  /** Oldest and newest selectable season, inclusive. */
  first: number;
  last: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /* Newest first — the current season is the one most people want. */
  const seasons = Array.from({ length: last - first + 1 }, (_, i) => last - i);

  return (
    <label className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      SEASON
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          startTransition(() =>
            router.replace(`?season=${e.target.value}`, { scroll: false })
          )
        }
        className={`border border-line bg-bg px-1.5 py-0.5 text-[10px] tracking-normal tabular-nums text-ink hover:border-accent ${
          pending ? "opacity-50" : ""
        }`}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
