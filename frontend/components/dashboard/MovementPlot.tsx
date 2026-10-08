"use client";

import { useMemo } from "react";
import type { Pitch } from "@/lib/api";
import { fmt, type ArsenalRow } from "@/lib/metrics";
import { PITCH_SLOTS, slotFor } from "@/lib/pitchColors";
import { Mark } from "./ZonePlot";

/*
 * Pitch movement, catcher's view: horizontal break (pfx_x) against induced
 * vertical break (pfx_z, gravity removed), in inches. Each pitch is a faint
 * mark in its type's slot color + shape; each type's average is a full-size
 * mark on top, so the arsenal's shape reads at a glance and the cloud shows
 * how tightly each pitch is repeated. The arsenal table's H-BRK / IVB
 * columns are the table twin; the average marks carry a native tooltip.
 */

const PX_IN = 8; // viewBox px per inch, both axes (true aspect)
const D: [number, number] = [-25, 25]; // inches, both axes
const PAD = { l: 40, r: 12, t: 10, b: 34 };
const PLOT = (D[1] - D[0]) * PX_IN; // 400
const W = PAD.l + PLOT + PAD.r;
const H = PAD.t + PLOT + PAD.b;
const sx = (x: number) => PAD.l + (x - D[0]) * PX_IN;
const sy = (z: number) => PAD.t + PLOT - (z - D[0]) * PX_IN;
const TICKS = [-20, -10, 0, 10, 20];

const MAX_POINTS = 2000; // same cap as the zone scatter; most recent win
const MUTED = "var(--color-ink-3)";
const GRID = "var(--color-grid)";

const inRange = (v: number) => v >= D[0] && v <= D[1];

export default function MovementPlot({
  pitches,
  arsenal,
}: {
  pitches: Pitch[];
  arsenal: ArsenalRow[];
}) {
  const pts = useMemo(() => {
    const all = pitches.flatMap((p) => {
      if (p.pfx_x === null || p.pfx_z === null) return [];
      const x = p.pfx_x * 12;
      const z = p.pfx_z * 12;
      return inRange(x) && inRange(z) ? [{ p, cx: sx(x), cy: sy(z) }] : [];
    });
    return all.length > MAX_POINTS ? all.slice(-MAX_POINTS) : all;
  }, [pitches]);

  const avgs = arsenal.filter(
    (r) =>
      r.avgHBreak !== null &&
      r.avgVBreak !== null &&
      inRange(r.avgHBreak) &&
      inRange(r.avgVBreak)
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={`Pitch movement chart, catcher's view, horizontal against induced vertical break in inches, ${pts.length} pitches`}
      >
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={PAD.t + PLOT} stroke={GRID} strokeWidth={t === 0 ? 1.5 : 1} />
            <line x1={PAD.l} y1={sy(t)} x2={PAD.l + PLOT} y2={sy(t)} stroke={GRID} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={sx(t)} y={PAD.t + PLOT + 14} textAnchor="middle" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t}
            </text>
            <text x={PAD.l - 8} y={sy(t) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t}
            </text>
          </g>
        ))}

        {/* Every pitch, receded so the averages read first. */}
        <g opacity={0.35} pointerEvents="none">
          {pts.map(({ p, cx, cy }, i) => {
            const slot = slotFor(p.pitch_type);
            return <Mark key={i} shape={slot.shape} cx={cx} cy={cy} color={slot.color} r={3} />;
          })}
        </g>

        {/* Per-type averages. */}
        {avgs.map((r) => {
          const slot = r.code === "OTH" ? slotFor(null) : PITCH_SLOTS[r.code];
          return (
            <g key={r.code}>
              <title>
                {`${r.name}: ${fmt.num(r.avgHBreak)}" H, ${fmt.num(r.avgVBreak)}" IVB · ${fmt.num(r.avgVelo)} MPH · ${r.n.toLocaleString()} pitches`}
              </title>
              <Mark shape={slot.shape} cx={sx(r.avgHBreak!)} cy={sy(r.avgVBreak!)} color={slot.color} r={7} />
            </g>
          );
        })}

        <text x={PAD.l + PLOT / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={MUTED} letterSpacing={1}>
          HORIZONTAL BREAK IN — CATCHER&apos;S VIEW
        </text>
        <text x={12} y={PAD.t + PLOT / 2} textAnchor="middle" fontSize={9} fill={MUTED} letterSpacing={1} transform={`rotate(-90 12 ${PAD.t + PLOT / 2})`}>
          INDUCED VERTICAL BREAK IN
        </text>

        {pts.length === 0 && (
          <text x={PAD.l + PLOT / 2} y={PAD.t + PLOT / 2} textAnchor="middle" fontSize={12} fill={MUTED}>
            NO MOVEMENT DATA IN SLICE
          </text>
        )}
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-grid px-1 pt-2 text-[10px] text-ink-2">
        {avgs.map((r) => {
          const slot = r.code === "OTH" ? slotFor(null) : PITCH_SLOTS[r.code];
          return (
            <span key={r.code} className="flex items-center gap-1.5">
              <svg width={12} height={12} viewBox="-6 -6 12 12" aria-hidden>
                <Mark shape={slot.shape} cx={0} cy={0} color={slot.color} r={3.4} />
              </svg>
              {r.code}
              <span className="text-ink-3 tabular-nums">
                {fmt.num(r.avgHBreak)}″ / {fmt.num(r.avgVBreak)}″
              </span>
            </span>
          );
        })}
        <span className="ml-auto text-ink-3">LARGE MARK = TYPE AVERAGE</span>
      </div>
    </div>
  );
}
