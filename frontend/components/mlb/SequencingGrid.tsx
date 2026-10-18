"use client";

import { useMemo, useState } from "react";
import type { Pitch } from "@/lib/api";
import { afterPitch, byCount } from "@/lib/sequencing";
import { HEAT_RAMP, heatColor, slotFor } from "@/lib/pitchColors";
import SegmentedControl from "@/components/ui/SegmentedControl";

/*
 * What's coming next: one row per count, or per pitch just thrown, and the
 * share of what followed by pitch type. The likeliest pitch in each row is
 * set bold — that cell is the answer the grid exists to give.
 *
 * Split by the batter's side because sequencing is: a righty's sweeper to
 * righties is often his changeup to lefties.
 */

/** Below this many pitches a row is shown faded — a 3-0 row of six pitches
 *  is a story, not a tendency. */
const THIN = 25;

type View = "count" | "after";
type Side = "all" | "L" | "R";

export default function SequencingGrid({
  pitches,
  codes,
}: {
  pitches: Pitch[];
  /** Pitch types in arsenal order, most-thrown first — the grid's columns. */
  codes: string[];
}) {
  const [view, setView] = useState<View>("count");
  const [side, setSide] = useState<Side>("all");

  const rows = useMemo(() => {
    const faced = side === "all" ? pitches : pitches.filter((p) => p.stand === side);
    return view === "count" ? byCount(faced, codes) : afterPitch(faced, codes);
  }, [pitches, codes, view, side]);

  const th =
    "border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<View>
          ariaLabel="Sequencing view"
          value={view}
          onChange={setView}
          options={[
            { value: "count", label: "BY COUNT" },
            { value: "after", label: "AFTER PITCH" },
          ]}
        />
        <SegmentedControl<Side>
          ariaLabel="Batter side"
          value={side}
          onChange={setSide}
          options={[
            { value: "all", label: "ALL" },
            { value: "L", label: "VS LHB" },
            { value: "R", label: "VS RHB" },
          ]}
        />
      </div>

      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className={`${th} text-left`}>
                {view === "count" ? "COUNT" : "AFTER"}
              </th>
              <th scope="col" className={`${th} text-right`} title="Pitches thrown in this situation">
                N
              </th>
              {codes.map((c) => (
                <th key={c} scope="col" className={`${th} text-right`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5"
                      style={{ background: slotFor(c === "OTH" ? null : c).color }}
                    />
                    {c}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const top = codes.reduce((a, b) =>
                (r.shares[b] ?? 0) > (r.shares[a] ?? 0) ? b : a,
              );
              return (
                <tr
                  key={r.key}
                  className={`border-b border-grid last:border-b-0 ${r.n < THIN ? "opacity-50" : ""}`}
                  title={r.n < THIN ? `Only ${r.n} pitches — a small sample` : undefined}
                >
                  <th
                    scope="row"
                    className="px-2 py-1.5 text-left font-bold tabular-nums text-ink"
                  >
                    {r.key}
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">
                    {r.n.toLocaleString()}
                  </td>
                  {codes.map((c) => {
                    const share = r.shares[c] ?? 0;
                    const bg = heatColor(share, 1);
                    /* The ramp's darker half takes white text. */
                    const dark = bg !== null && HEAT_RAMP.indexOf(bg as never) >= 3;
                    return (
                      <td
                        key={c}
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          dark ? "text-white" : share ? "text-ink-2" : "text-ink-3"
                        } ${c === top && r.n ? "font-bold" : ""}`}
                        style={bg ? { background: bg } : undefined}
                      >
                        {r.n ? `${Math.round(share * 100)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] tracking-wider text-ink-3">
        EACH ROW IS 100% — THE ODDS ON THE NEXT PITCH. BOLD IS THE LIKELIEST.
        FADED ROWS HAVE FEWER THAN {THIN} PITCHES.
      </p>
    </div>
  );
}
