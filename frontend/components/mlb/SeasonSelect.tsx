"use client";

import { useTransition } from "react";
import { useSetParam } from "@/lib/useSetParam";

/*
 * Season picker for the leader boards and the player page. The choice lives
 * in the URL rather than in component state, because both are fetched on the
 * server: picking a year is a navigation, so a season is linkable and the
 * page streams the new one in behind its own skeleton. `replace` keeps a
 * browsing session from stacking one history entry per year tried.
 *
 * A caller either names a contiguous range — the boards run from the first
 * season on record — or hands over the exact years to offer, since a career
 * skips the seasons a player missed.
 */
type Props = { value: number } & (
  | { first: number; last: number; seasons?: undefined }
  | { seasons: number[]; first?: undefined; last?: undefined }
);

/* Newest first — the current season is the one most people want. */
function yearsOf(p: Props): number[] {
  if (p.seasons) return p.seasons;
  return Array.from({ length: p.last - p.first + 1 }, (_, i) => p.last - i);
}

export default function SeasonSelect(props: Props) {
  const { value } = props;
  const setParam = useSetParam();
  const [pending, startTransition] = useTransition();
  const years = yearsOf(props);

  return (
    <label className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      SEASON
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => setParam("season", e.target.value))
        }
        className={`border border-line bg-bg px-1.5 py-0.5 text-[10px] tracking-normal tabular-nums text-ink hover:border-accent ${
          pending ? "opacity-50" : ""
        }`}
      >
        {years.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
