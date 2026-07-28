"use client";

import { useState } from "react";
import type { Leaderboard } from "@/lib/mlb";
import SegmentedControl from "@/components/ui/SegmentedControl";

/*
 * Season stat leaders, split into hitting / pitching via a segmented toggle.
 * Each category renders a compact ranked list. Data is fetched server-side
 * and passed in whole; this component only picks which group to show.
 */
export default function Leaderboards({ boards }: { boards: Leaderboard[] }) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");
  const shown = boards.filter((b) => b.group === group && b.leaders.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.25em] text-ink-3">
          {shown.length} CATEGORIES · {group.toUpperCase()}
        </p>
        <SegmentedControl<"hitting" | "pitching">
          ariaLabel="Stat group"
          value={group}
          onChange={setGroup}
          options={[
            { value: "hitting", label: "HITTING" },
            { value: "pitching", label: "PITCHING" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO LEADER DATA FOR THIS SEASON YET
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((b) => (
            <div key={b.code} className="border border-line bg-bg">
              <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
                {b.label}
              </h3>
              <ol>
                {b.leaders.map((l) => (
                  <li
                    key={l.personId}
                    className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0"
                  >
                    <span className="w-4 text-right text-[10px] text-ink-3 tabular-nums">
                      {l.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {l.name}
                    </span>
                    <span className="w-14 text-right font-bold text-ink tabular-nums">
                      {l.value}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
