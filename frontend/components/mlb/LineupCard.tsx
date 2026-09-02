"use client";

import { useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerLink from "@/components/mlb/PlayerLink";
import {
  LINEUP_COLS,
  teamStatText,
  type LineupLine,
  type LineupSpot,
} from "@/lib/mlb";

/*
 * Tonight's posted lineups, each hitter read two ways: his season line, and
 * what he has done against the arm he is facing today. Both are fetched with
 * the page, so the toggle is instant and neither mode waits on a request.
 */

export interface LineupSide {
  abbr: string;
  spots: LineupSpot[];
  season: Record<number, LineupLine>;
  /** Career against today's opposing starter, by player id. */
  vs: Record<number, LineupLine>;
  /** Whose line the career column is against — "F. Peralta". */
  facing: string;
}

/** "Freddy Peralta" → "F. Peralta", the way a matchup label is written. */
export const shortName = (name: string): string => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
};

export default function LineupCard({
  away,
  home,
}: {
  away: LineupSide;
  home: LineupSide;
}) {
  const [which, setWhich] = useState<"away" | "home">("away");
  const [mode, setMode] = useState<"season" | "vs">("season");
  const side = which === "away" ? away : home;
  const lines = mode === "season" ? side.season : side.vs;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          ariaLabel="Lineup"
          value={which}
          onChange={setWhich}
          options={[
            { value: "away" as const, label: `${away.abbr} LINEUP` },
            { value: "home" as const, label: `${home.abbr} LINEUP` },
          ]}
        />
        <SegmentedControl
          ariaLabel="Split"
          value={mode}
          onChange={setMode}
          options={[
            { value: "season" as const, label: "SEASON" },
            {
              value: "vs" as const,
              label: side.facing
                ? `CAREER VS ${shortName(side.facing).toUpperCase()}`
                : "CAREER VS STARTER",
            },
          ]}
        />
      </div>

      {side.spots.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          LINEUP NOT POSTED YET
        </p>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {["#", "HITTER", "POS"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                      i === 1 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
                {LINEUP_COLS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    className="border-b border-line bg-surface px-2 py-2 text-right text-[10px] font-normal tracking-widest text-ink-3"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {side.spots.map((s, i) => {
                const line = lines[s.id];
                return (
                  <tr
                    key={s.id}
                    className="border-b border-grid last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <PlayerLink id={s.id}>{s.name}</PlayerLink>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px] tracking-wider text-ink-3">
                      {s.pos}
                    </td>
                    {LINEUP_COLS.map((c) => (
                      <td
                        key={c.key}
                        className="px-2 py-1.5 text-right tabular-nums text-ink-2"
                      >
                        {/* Never faced him is a fact about the matchup, not a
                            missing number — it reads as a dash, not 0-0. */}
                        {line ? teamStatText(line[c.key]) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
