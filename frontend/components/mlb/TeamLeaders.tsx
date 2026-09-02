"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";
import type { TeamLeaderBoard } from "@/lib/mlb";

/*
 * The two clubs' leaders side by side, a bat and an arm being different
 * questions — the toggle picks which one is being asked, rather than stacking
 * both boards and making the panel twice as tall as the ones beside it.
 */

type Leader = TeamLeaderBoard["leaders"][number] | undefined;

function LeaderRow({
  label,
  away,
  home,
}: {
  label: string;
  away: Leader;
  home: Leader;
}) {
  const cell = (l: Leader, right: boolean) => (
    <td className={`px-2 py-1.5 ${right ? "text-right" : ""}`}>
      {l ? (
        <>
          <span className="block truncate">
            <PlayerLink id={l.id} className={right ? "flex-row-reverse" : ""}>
              {l.name}
            </PlayerLink>
          </span>
          <span className="text-[10px] tabular-nums text-ink-3">{l.value}</span>
        </>
      ) : (
        <span className="text-ink-3">—</span>
      )}
    </td>
  );
  return (
    <tr className="border-b border-grid last:border-b-0">
      {cell(away, false)}
      <td className="px-2 py-1.5 text-center text-[10px] tracking-[0.2em] whitespace-nowrap text-ink-3">
        {label}
      </td>
      {cell(home, true)}
    </tr>
  );
}

export default function TeamLeaders({
  away,
  home,
  awayAbbr,
  homeAbbr,
}: {
  /** Both clubs' boards, in the same order — one spec per index. */
  away: TeamLeaderBoard[];
  home: TeamLeaderBoard[];
  awayAbbr: string;
  homeAbbr: string;
}) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");

  return (
    <Panel
      title="TEAM LEADERS"
      right={
        <SegmentedControl
          ariaLabel="Leader board"
          value={group}
          onChange={setGroup}
          options={[
            { value: "hitting" as const, label: "BATTING" },
            { value: "pitching" as const, label: "PITCHING" },
          ]}
        />
      }
    >
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {[awayAbbr, " ", homeAbbr].map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`border-b border-line px-2 py-1.5 text-[10px] font-normal tracking-widest text-ink-3 ${
                    ["text-left", "text-center", "text-right"][i]
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {away.map((b, i) =>
              b.group === group ? (
                <LeaderRow
                  key={b.key}
                  label={b.label}
                  away={b.leaders[0]}
                  home={home[i]?.leaders[0]}
                />
              ) : null
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
