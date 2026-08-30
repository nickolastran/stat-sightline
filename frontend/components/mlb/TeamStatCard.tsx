"use client";

import { useState } from "react";
import Link from "next/link";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { ordinal, teamStatText, type RankedStat } from "@/lib/mlb";

/*
 * The club's four headline figures with where each places among the thirty,
 * batting or pitching. Both groups arrive with the page; the toggle is local
 * so switching costs nothing.
 */
export default function TeamStatCard({
  season,
  hitting,
  pitching,
}: {
  season: number;
  hitting: RankedStat[];
  pitching: RankedStat[];
}) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");
  const stats = group === "hitting" ? hitting : pitching;

  return (
    <div className="border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[10px] tracking-[0.25em] text-ink-3">
          {season} TEAM STATS
        </h2>
        <SegmentedControl<"hitting" | "pitching">
          ariaLabel="Stat group"
          value={group}
          onChange={setGroup}
          options={[
            { value: "hitting", label: "BATTING" },
            { value: "pitching", label: "PITCHING" },
          ]}
        />
      </header>
      <dl className="grid grid-cols-2">
        {stats.map((s) => (
          <div
            key={s.key}
            className="border-b border-r border-grid px-3 py-3 text-center last:border-r-0 even:border-r-0"
          >
            <dt className="text-[10px] tracking-[0.15em] text-ink-3">
              {s.label}
            </dt>
            <dd className="mt-1.5 text-2xl font-bold leading-none tabular-nums text-ink">
              {teamStatText(s.value)}
            </dd>
            <p className="mt-1.5 text-[10px] tracking-wider text-ink-3">
              {s.rank === null ? "—" : ordinal(s.rank)}
            </p>
          </div>
        ))}
      </dl>
      <Link
        href="/league/teams"
        className="block px-3 py-2 text-center text-[10px] tracking-wider text-ink-2 hover:text-accent"
      >
        FULL TEAM STATS →
      </Link>
    </div>
  );
}
