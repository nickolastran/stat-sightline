"use client";

import { useMemo, useState } from "react";
import type { Pitch } from "@/lib/api";
import type { Percentile } from "@/lib/advanced";
import { arsenalRows } from "@/lib/metrics";
import { PITCH_SLOTS, pctColor } from "@/lib/pitchColors";
import Panel from "@/components/ui/Panel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ArsenalTable from "@/components/dashboard/ArsenalTable";
import MovementPlot from "@/components/dashboard/MovementPlot";
import ZonePlot, { type ZonePlotMode } from "@/components/dashboard/ZonePlot";

/*
 * A player's season through Statcast: Savant's percentile card, then the
 * pitch dashboard's own charts over that season's pitches — thrown, for a
 * pitcher, with the movement chart and arsenal; seen, for a batter, where
 * the hot/cold grid is the read.
 */

const NAMED_TYPES: ReadonlySet<string> = new Set(Object.keys(PITCH_SLOTS));

function Percentiles({ rows, season }: { rows: Percentile[]; season: number }) {
  return (
    <Panel title={`Percentile Rankings — ${season}`}>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">
          BELOW SAVANT&apos;S PLAYING-TIME MINIMUM FOR {season}
        </p>
      ) : (
        <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-[11px]">
              <span className="truncate text-ink-2">{r.label}</span>
              <span className="h-2 bg-bg" aria-hidden>
                <span
                  className="block h-full"
                  style={{ width: `${Math.max(r.pct, 2)}%`, background: pctColor(r.pct) }}
                />
              </span>
              <span className="text-right font-bold text-ink tabular-nums">{r.pct}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function StatcastPanels({
  pitches,
  percentiles,
  role,
  season,
}: {
  pitches: Pitch[];
  percentiles: Percentile[];
  role: "pitcher" | "batter";
  season: number;
}) {
  const [mode, setMode] = useState<ZonePlotMode>(role === "batter" ? "zones" : "scatter");
  const arsenal = useMemo(() => arsenalRows(pitches, NAMED_TYPES), [pitches]);

  return (
    <div className="space-y-3">
      <Percentiles rows={percentiles} season={season} />
      {pitches.length === 0 ? (
        <Panel title="Pitch Tracking">
          <p className="text-xs text-ink-3">NO TRACKED PITCHES IN {season}</p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title={role === "pitcher" ? "Pitch Location" : "Pitches Seen"}
              right={
                <SegmentedControl<ZonePlotMode>
                  ariaLabel="Plot mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "scatter", label: "SCATTER" },
                    { value: "heat", label: "DENSITY" },
                    { value: "zones", label: "HOT/COLD" },
                  ]}
                />
              }
            >
              <ZonePlot pitches={pitches} mode={mode} />
            </Panel>
            {role === "pitcher" && (
              <Panel title="Pitch Movement">
                <MovementPlot pitches={pitches} arsenal={arsenal} />
              </Panel>
            )}
          </div>
          {role === "pitcher" && (
            <Panel title="Arsenal">
              <ArsenalTable rows={arsenal} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
