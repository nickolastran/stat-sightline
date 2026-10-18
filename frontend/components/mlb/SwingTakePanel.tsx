import type { Pitch } from "@/lib/api";
import { pctColor } from "@/lib/pitchColors";
import { swingTake, type SwingTakeRow } from "@/lib/swingTake";

/*
 * A hitter's swing decisions in runs: the four attack rings drawn nested the
 * way Savant draws them, each shaded by the runs won or lost there — red
 * where he gains, blue where he gives them away — and the table twin
 * splitting each ring's runs into swings and takes. Positive is always good
 * for the hitter.
 */

/** ±25 runs in a ring reads as the far end of the ramp. */
const RUNS_AT_END = 25;
const shade = (runs: number) => 50 + (runs / RUNS_AT_END) * 50;

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}`;

/* Ring half-sizes in the chart's units, out to the waste edge — the zone's
   own proportions, 67 / 133 / 200 %, with waste given a band to sit in. */
const RINGS = [
  { zone: "waste", half: 2.6 },
  { zone: "chase", half: 2 },
  { zone: "shadow", half: 1.33 },
  { zone: "heart", half: 0.67 },
] as const;
const UNIT_X = 44;
const UNIT_Y = 44;
const W = 2.6 * UNIT_X * 2;
const H = 2.6 * UNIT_Y * 2;

function Rings({ rows }: { rows: Record<string, SwingTakeRow> }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto h-64 w-auto shrink-0"
      role="img"
      aria-label={RINGS.map((r) => `${r.zone} ${signed(rows[r.zone].runs)} runs`).join(", ")}
    >
      {RINGS.map(({ zone, half }, i) => {
        const runs = rows[zone].runs;
        const pct = shade(runs);
        const w = half * UNIT_X * 2;
        const h = half * UNIT_Y * 2;
        const x = (W - w) / 2;
        const y = (H - h) / 2;
        /* The heart's label sits in its middle, on two lines to fit; each
           ring's in its top band. */
        const heart = zone === "heart";
        const ty = heart ? H / 2 - 3 : y + ((half - RINGS[i + 1].half) * UNIT_Y) / 2 + 5;
        return (
          <g key={zone}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={pctColor(pct)}
              className="stroke-surface"
              strokeWidth={2}
            />
            <text
              x={W / 2}
              y={ty}
              textAnchor="middle"
              className="text-[13px] font-bold tabular-nums"
              fill={Math.abs(pct - 50) > 25 ? "#fff" : "#1a1a1a"}
            >
              {heart ? (
                <>
                  <tspan x={W / 2}>HEART</tspan>
                  <tspan x={W / 2} dy={15}>{signed(runs)}</tspan>
                </>
              ) : (
                `${zone.toUpperCase()} ${signed(runs)}`
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SwingTakePanel({ pitches }: { pitches: Pitch[] }) {
  const table = swingTake(pitches);
  const rows = Object.fromEntries(table.map((r) => [r.zone, r]));
  if (rows.all.pitches === 0)
    return <p className="text-xs text-ink-3">NO RUN VALUES ON THESE PITCHES</p>;

  const th = "border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3";
  const cell = (v: number) => (
    <span style={{ color: Math.abs(v) >= 1 ? pctColor(shade(v * 2)) : undefined }}>{signed(v)}</span>
  );

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
      <Rings rows={rows} />
      <div className="w-full min-w-0 flex-1 space-y-2">
        <div className="overflow-x-auto border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className={`${th} text-left`}>ZONE</th>
                <th scope="col" className={`${th} text-right`}>PITCHES</th>
                <th scope="col" className={`${th} text-right`} title="Swings per pitch in the ring">SWING%</th>
                <th scope="col" className={`${th} text-right`} title="Runs won or lost swinging">SWING RV</th>
                <th scope="col" className={`${th} text-right`} title="Runs won or lost taking">TAKE RV</th>
                <th scope="col" className={`${th} text-right`}>RUNS</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr
                  key={r.zone}
                  className={`border-b border-grid last:border-b-0 ${r.zone === "all" ? "font-bold" : ""}`}
                >
                  <th scope="row" className="px-2 py-1.5 text-left text-[11px] tracking-wider text-ink">
                    {r.zone.toUpperCase()}
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">{r.pitches.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-2">
                    {r.pitches ? `${Math.round((r.swings / r.pitches) * 100)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{cell(r.swingRuns)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{cell(r.takeRuns)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{cell(r.runs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] leading-4 tracking-wider text-ink-3">
          RUNS ARE THE HITTER&apos;S: + IS RUNS GAINED. CHASE AND WASTE ARE WON BY TAKING;
          HEART IS WON BY SWINGING. RINGS FOLLOW SAVANT&apos;S ATTACK ZONES.
        </p>
      </div>
    </div>
  );
}
