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
import { MATCHUP_COLS } from "@/lib/api";
import { EDGE_COLS } from "@/lib/matchupEdge";

/*
 * Tonight's posted lineups, each hitter read two ways: his season line, and
 * what he has done against the arm he is facing today. All are fetched with
 * the page, so the toggle is instant and no mode waits on a request.
 *
 * A third read, pitch by pitch against the starter, comes off the local
 * warehouse; where that isn't reachable (production) the option isn't shown.
 * A fourth projects each hitter against the starter's pitch mix, met or not.
 */

export interface LineupSide {
  abbr: string;
  spots: LineupSpot[];
  season: Record<number, LineupLine>;
  /** Career against today's opposing starter, by player id. */
  vs: Record<number, LineupLine>;
  /** Pitch-level line against today's starter, or null when unavailable. */
  pitch: Record<number, LineupLine> | null;
  /** Projection against today's starter's pitch mix, or null when unavailable. */
  edge: Record<number, LineupLine> | null;
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
  const [picked, setPicked] = useState<"season" | "vs" | "pitch" | "edge">("season");
  const side = which === "away" ? away : home;
  /* The pitch and mix views can be picked on one side and missing on the
     other; that side falls back to the season line rather than an empty table. */
  const mode =
    (picked === "pitch" && !side.pitch) || (picked === "edge" && !side.edge)
      ? "season"
      : picked;
  const lines =
    mode === "pitch"
      ? side.pitch!
      : mode === "edge"
        ? side.edge!
        : mode === "vs"
          ? side.vs
          : side.season;
  const cols =
    mode === "pitch" ? MATCHUP_COLS : mode === "edge" ? EDGE_COLS : LINEUP_COLS;
  const vsWho = side.facing ? shortName(side.facing).toUpperCase() : "STARTER";

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
          onChange={setPicked}
          options={[
            { value: "season" as const, label: "SEASON" },
            { value: "vs" as const, label: `CAREER VS ${vsWho}` },
            ...(side.pitch
              ? [{ value: "pitch" as const, label: `PITCH LEVEL VS ${vsWho}` }]
              : []),
            ...(side.edge
              ? [{ value: "edge" as const, label: `PROJECTED VS ${vsWho}` }]
              : []),
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
                {cols.map((c) => (
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
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums text-ink-2"
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
