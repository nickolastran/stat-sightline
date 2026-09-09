"use client";

import { useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  TOTAL_ROWS,
  teamColor,
  teamStatNum,
  teamStatText,
  type BoxScore,
} from "@/lib/mlb";

/*
 * The two clubs' running totals, one figure per row with a bar apiece — the
 * comparison a game is read on while it is being played. Batting and pitching
 * are the same rows for both sides, so the toggle swaps the numbers without
 * moving the table.
 */
export default function TeamTotals({ box }: { box: BoxScore }) {
  const [group, setGroup] = useState<"hitting" | "pitching">("hitting");
  const rows = TOTAL_ROWS[group];

  return (
    <div className="space-y-2">
      <SegmentedControl
        ariaLabel="Totals"
        value={group}
        onChange={setGroup}
        options={[
          { value: "hitting" as const, label: "HITTING" },
          { value: "pitching" as const, label: "PITCHING" },
        ]}
      />
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-2 py-1.5 text-left text-[10px] font-normal tracking-widest text-ink-3">
                {box.away.abbr}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1.5 text-center text-[10px] font-normal tracking-widest text-ink-3">
                &nbsp;
              </th>
              <th scope="col" className="border-b border-line px-2 py-1.5 text-right text-[10px] font-normal tracking-widest text-ink-3">
                {box.home.abbr}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const a = teamStatNum(box.away.totals[group][c.key]) ?? 0;
              const h = teamStatNum(box.home.totals[group][c.key]) ?? 0;
              /* Both bars are drawn against the larger of the two, so the
                 lengths compare directly and a zero shows as nothing. */
              const top = Math.max(a, h, 1);
              const bar = (v: number, right: boolean) => (
                <td className={`w-2/5 px-2 py-1.5 ${right ? "text-right" : ""}`}>
                  <span className="block tabular-nums text-ink">
                    {teamStatText(box[right ? "home" : "away"].totals[group][c.key])}
                  </span>
                  <span
                    aria-hidden
                    className={`mt-1 flex h-1 bg-grid ${right ? "justify-end" : ""}`}
                  >
                    {/* Each club's own colour: two bars on one row, and the
                        accent can only stand for one of them. */}
                    <span
                      className="block h-full"
                      style={{
                        width: `${(v / top) * 100}%`,
                        background: teamColor(box[right ? "home" : "away"].id),
                      }}
                    />
                  </span>
                </td>
              );
              return (
                <tr key={c.key} className="border-b border-grid last:border-b-0">
                  {bar(a, false)}
                  <td
                    title={c.title}
                    className="px-2 py-1.5 text-center text-[10px] tracking-[0.2em] whitespace-nowrap text-ink-3"
                  >
                    {c.label}
                  </td>
                  {bar(h, true)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
