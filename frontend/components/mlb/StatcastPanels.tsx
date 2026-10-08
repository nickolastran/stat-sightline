"use client";

import { useMemo, useState } from "react";
import type { Pitch } from "@/lib/api";
import type { PercentileSection } from "@/lib/advanced";
import { arsenalRows } from "@/lib/metrics";
import { ordinal } from "@/lib/mlb";
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

/* Bar column scale, set once over the first section like Savant's. */
function Scale() {
  return (
    <div className="grid grid-cols-[9rem_1fr_3rem] gap-3 text-[9px] tracking-widest">
      <span />
      <span className="flex justify-between">
        <span style={{ color: pctColor(0) }}>▲ POOR</span>
        <span className="text-ink-3">AVERAGE</span>
        <span style={{ color: pctColor(100) }}>GREAT ▲</span>
      </span>
      <span />
    </div>
  );
}

function PercentileBar({ pct, qualified }: { pct: number; qualified: boolean }) {
  const color = pctColor(pct);
  return (
    <span className="relative flex h-6 items-center" aria-hidden>
      <span className="absolute inset-x-0 h-1 bg-grid" />
      <span
        className="absolute left-0 h-4"
        style={{
          width: `${Math.max(pct, 1)}%`,
          background: qualified
            ? color
            : `repeating-linear-gradient(-45deg, ${color} 0 2px, transparent 2px 5px)`,
          opacity: qualified ? 1 : 0.55,
        }}
      />
      {qualified && (
        <span
          className="absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-surface text-[10px] font-bold text-white tabular-nums"
          style={{ left: `clamp(0.75rem, ${pct}%, calc(100% - 0.75rem))`, background: color }}
        >
          {pct}
        </span>
      )}
    </span>
  );
}

function Percentiles({ sections, season }: { sections: PercentileSection[]; season: number }) {
  const rows = sections.flatMap((s) => s.rows);
  return (
    <Panel title={`${season} MLB Percentile Rankings`}>
      {/* Empty only when Savant itself couldn't be reached. */}
      {rows.every((r) => r.pct === null && r.value === null) ? (
        <p className="text-xs text-ink-3">PERCENTILES UNAVAILABLE — NO SAVANT FIGURES FOR {season}</p>
      ) : (
        <div className="max-w-2xl space-y-4">
          {sections.map((s, i) => (
            <section key={s.title}>
              <h3 className="border-b-2 border-accent pb-1 text-sm font-bold text-ink">{s.title}</h3>
              {i === 0 && <div className="mt-1"><Scale /></div>}
              <ul>
                {s.rows.map((r) => (
                  <li
                    key={r.label}
                    className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-[11px]"
                    title={
                      r.pct === null
                        ? `${r.label}: no figure in ${season}`
                        : `${r.label}: ${ordinal(r.pct).toLowerCase()} percentile${r.qualified ? "" : " — not qualified, ranked against the qualified field"}`
                    }
                  >
                    <span
                      className={`truncate border-b border-dashed border-line py-1 text-right ${r.pct === null ? "text-ink-3" : "text-ink-2"}`}
                    >
                      {r.label}
                    </span>
                    {r.pct === null ? (
                      <span className="relative flex h-6 items-center" aria-hidden>
                        <span className="absolute inset-x-0 h-1 bg-grid" />
                      </span>
                    ) : (
                      <PercentileBar pct={r.pct} qualified={r.qualified} />
                    )}
                    <span className={`text-right tabular-nums ${r.value === null ? "text-ink-3" : "text-ink"}`}>
                      {r.value ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rows.some((r) => !r.qualified) && (
            <p className="text-[10px] tracking-wider text-ink-3">
              HATCHED — BELOW SAVANT&apos;S PLAYING-TIME MINIMUM; PLACED AGAINST THE QUALIFIED FIELD
            </p>
          )}
        </div>
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
  percentiles: PercentileSection[];
  role: "pitcher" | "batter";
  season: number;
}) {
  const [mode, setMode] = useState<ZonePlotMode>(role === "batter" ? "zones" : "scatter");
  const arsenal = useMemo(() => arsenalRows(pitches, NAMED_TYPES), [pitches]);

  return (
    <div className="space-y-3">
      <Percentiles sections={percentiles} season={season} />
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
