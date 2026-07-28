"use client";

import { useMemo, useRef, useState } from "react";
import type { Pitch } from "@/lib/api";
import { heatColor, HEAT_RAMP, PITCH_SLOTS, slotFor } from "@/lib/pitchColors";

/*
 * Strike-zone plot, catcher's view. Two modes over the same geometry:
 *  - scatter: one mark per pitch, colored + SHAPED by pitch type (shape is
 *    the secondary encoding required by the palette's floor-band CVD ΔE),
 *    nearest-point hover within 24px so nobody has to hit a dot dead-center.
 *  - heat: 0.25 ft density grid on a single-hue sequential ramp anchored to
 *    the dark surface (near-zero recedes; max reads brightest).
 * Tooltips enhance, never gate — the pitch log table is the table twin.
 */

export type ZonePlotMode = "scatter" | "heat";

/* Geometry — 80 viewBox px per foot in both axes (true aspect). */
const PX_FT = 80;
const XD: [number, number] = [-2.5, 2.5]; // plate_x domain, ft
const ZD: [number, number] = [0, 4.8]; // plate_z domain, ft
const PAD = { l: 40, r: 12, t: 10, b: 34 };
const PLOT_W = (XD[1] - XD[0]) * PX_FT; // 400
const PLOT_H = (ZD[1] - ZD[0]) * PX_FT; // 384
const W = PAD.l + PLOT_W + PAD.r;
const H = PAD.t + PLOT_H + PAD.b;
const sx = (x: number) => PAD.l + (x - XD[0]) * PX_FT;
const sz = (z: number) => PAD.t + PLOT_H - (z - ZD[0]) * PX_FT;

/* League-average rulebook zone drawn as the backdrop. */
const ZONE = { x1: -0.83, x2: 0.83, z1: 1.5, z2: 3.5 };

const MAX_POINTS = 2000; // scatter cap; most recent pitches win
const HIT_RADIUS = 24; // nearest-point hover radius, viewBox px
const CELL_FT = 0.25; // heat bin size
const HEAT_X: [number, number] = [-2, 2];
const HEAT_Z: [number, number] = [0.4, 4.4];

const SURFACE = "#1a1a19";
const MUTED = "#898781";
const GRID = "#2c2c2a";

/* Series marks — ~9px across, 2px surface ring for overlap legibility. */
function Mark({
  shape,
  cx,
  cy,
  color,
  r = 4.5,
}: {
  shape: string;
  cx: number;
  cy: number;
  color: string;
  r?: number;
}) {
  const common = { fill: color, stroke: SURFACE, strokeWidth: 1.6 };
  switch (shape) {
    case "square":
      return (
        <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />
      );
    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - r * 1.2} ${cx - r * 1.1},${cy + r} ${cx + r * 1.1},${cy + r}`}
          {...common}
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - r * 1.3} ${cx + r * 1.3},${cy} ${cx},${cy + r * 1.3} ${cx - r * 1.3},${cy}`}
          {...common}
        />
      );
    case "cross": {
      const t = r * 0.55;
      return (
        <path
          d={`M${cx - t} ${cy - r}h${2 * t}v${r - t}h${r - t}v${2 * t}h${-(r - t)}v${r - t}h${-2 * t}v${-(r - t)}h${-(r - t)}v${-2 * t}h${r - t}z`}
          {...common}
        />
      );
    }
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r * 1.4 : r * 0.6;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`);
      }
      return <polygon points={pts.join(" ")} {...common} />;
    }
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

interface TooltipState {
  cx: number;
  cy: number;
  title: string;
  lines: { label: string; value: string }[];
  color?: string;
}

export default function ZonePlot({
  pitches,
  mode,
}: {
  pitches: Pitch[];
  mode: ZonePlotMode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const located = useMemo(
    () =>
      pitches.filter(
        (p) =>
          p.plate_x !== null &&
          p.plate_x >= XD[0] &&
          p.plate_x <= XD[1] &&
          p.plate_z !== null &&
          p.plate_z >= ZD[0] &&
          p.plate_z <= ZD[1]
      ),
    [pitches]
  );

  /* Scatter working set: precomputed screen coords, capped for render cost. */
  const pts = useMemo(() => {
    const capped =
      located.length > MAX_POINTS ? located.slice(-MAX_POINTS) : located;
    return capped.map((p, i) => ({
      p,
      i,
      cx: sx(p.plate_x as number),
      cy: sz(p.plate_z as number),
    }));
  }, [located]);

  /* Series legend: fixed slot color/shape per type; counts from the slice. */
  const series = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { p } of pts) {
      const code = p.pitch_type && PITCH_SLOTS[p.pitch_type] ? p.pitch_type : "OTH";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pts]);

  /* Heat bins over the fixed grid. */
  const heat = useMemo(() => {
    if (mode !== "heat") return null;
    const cols = Math.round((HEAT_X[1] - HEAT_X[0]) / CELL_FT);
    const rows = Math.round((HEAT_Z[1] - HEAT_Z[0]) / CELL_FT);
    const cells = new Map<string, number>();
    let max = 0;
    for (const p of located) {
      const cx = Math.floor(((p.plate_x as number) - HEAT_X[0]) / CELL_FT);
      const cz = Math.floor(((p.plate_z as number) - HEAT_Z[0]) / CELL_FT);
      if (cx < 0 || cx >= cols || cz < 0 || cz >= rows) continue;
      const k = `${cx}:${cz}`;
      const v = (cells.get(k) ?? 0) + 1;
      cells.set(k, v);
      if (v > max) max = v;
    }
    return { cells, max, cols, rows };
  }, [located, mode]);

  /* Nearest-point hover: the whole plot is the hit surface. */
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== "scatter" || pts.length === 0) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    let best: (typeof pts)[number] | null = null;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (const pt of pts) {
      const d = (pt.cx - mx) ** 2 + (pt.cy - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = pt;
      }
    }
    if (!best) {
      setTip(null);
      setHoverKey(null);
      return;
    }
    const p = best.p;
    setHoverKey(`pt-${best.i}`);
    setTip({
      cx: best.cx,
      cy: best.cy,
      color: slotFor(p.pitch_type).color,
      title: p.pitch_name ?? p.pitch_type ?? "UNKNOWN",
      lines: [
        { label: "VELO", value: p.release_speed ? `${p.release_speed.toFixed(1)} MPH` : "—" },
        { label: "COUNT", value: p.balls !== null && p.strikes !== null ? `${p.balls}-${p.strikes}` : "—" },
        { label: "RESULT", value: (p.description ?? "—").replaceAll("_", " ").toUpperCase() },
        ...(p.launch_speed !== null
          ? [{ label: "EV", value: `${p.launch_speed.toFixed(1)} MPH` }]
          : []),
        { label: "DATE", value: p.game_date ?? "—" },
      ],
    });
  };

  const clearHover = () => {
    setTip(null);
    setHoverKey(null);
  };

  const hovered = hoverKey?.startsWith("pt-")
    ? pts[Number(hoverKey.slice(3))]
    : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={`Pitch location ${mode === "heat" ? "density heatmap" : "scatter plot"}, catcher's view, ${located.length} pitches`}
        onPointerMove={onMove}
        onPointerLeave={clearHover}
      >
        {/* Gridlines — solid hairlines, recessive. */}
        {[-2, -1, 0, 1, 2].map((x) => (
          <line key={`gx${x}`} x1={sx(x)} y1={PAD.t} x2={sx(x)} y2={PAD.t + PLOT_H} stroke={GRID} strokeWidth={1} />
        ))}
        {[1, 2, 3, 4].map((z) => (
          <line key={`gz${z}`} x1={PAD.l} y1={sz(z)} x2={PAD.l + PLOT_W} y2={sz(z)} stroke={GRID} strokeWidth={1} />
        ))}

        {/* Heat cells under the zone outline. */}
        {mode === "heat" &&
          heat &&
          [...heat.cells.entries()].map(([k, v]) => {
            const [cx, cz] = k.split(":").map(Number);
            const fill = heatColor(v, heat.max);
            if (!fill) return null;
            const x = sx(HEAT_X[0] + cx * CELL_FT);
            const z = sz(HEAT_Z[0] + (cz + 1) * CELL_FT);
            const size = CELL_FT * PX_FT - 2; // 2px surface gap between cells
            const active = hoverKey === `cell-${k}`;
            return (
              <rect
                key={k}
                x={x + 1}
                y={z + 1}
                width={size}
                height={size}
                fill={fill}
                stroke={active ? "#ffffff" : "none"}
                strokeWidth={active ? 1.5 : 0}
                onPointerEnter={() => {
                  setHoverKey(`cell-${k}`);
                  setTip({
                    cx: x + size / 2,
                    cy: z + size / 2,
                    title: `${v} PITCH${v === 1 ? "" : "ES"}`,
                    lines: [
                      { label: "SHARE", value: `${((v / located.length) * 100).toFixed(1)}%` },
                      { label: "CELL", value: `${CELL_FT} × ${CELL_FT} FT` },
                    ],
                  });
                }}
                onPointerLeave={clearHover}
              />
            );
          })}

        {/* Strike zone backdrop + thirds. */}
        <g pointerEvents="none">
          {[1, 2].map((i) => (
            <g key={i}>
              <line
                x1={sx(ZONE.x1 + ((ZONE.x2 - ZONE.x1) / 3) * i)}
                y1={sz(ZONE.z2)}
                x2={sx(ZONE.x1 + ((ZONE.x2 - ZONE.x1) / 3) * i)}
                y2={sz(ZONE.z1)}
                stroke={GRID}
                strokeWidth={1}
              />
              <line
                x1={sx(ZONE.x1)}
                y1={sz(ZONE.z1 + ((ZONE.z2 - ZONE.z1) / 3) * i)}
                x2={sx(ZONE.x2)}
                y2={sz(ZONE.z1 + ((ZONE.z2 - ZONE.z1) / 3) * i)}
                stroke={GRID}
                strokeWidth={1}
              />
            </g>
          ))}
          <rect
            x={sx(ZONE.x1)}
            y={sz(ZONE.z2)}
            width={(ZONE.x2 - ZONE.x1) * PX_FT}
            height={(ZONE.z2 - ZONE.z1) * PX_FT}
            fill="none"
            stroke={mode === "heat" ? "#ffffff" : MUTED}
            strokeWidth={1.5}
          />
        </g>

        {/* Scatter marks. */}
        {mode === "scatter" && (
          <g>
            {pts.map(({ p, i, cx, cy }) => (
              <Mark
                key={i}
                shape={slotFor(p.pitch_type).shape}
                cx={cx}
                cy={cy}
                color={slotFor(p.pitch_type).color}
              />
            ))}
            {hovered && (
              <circle
                cx={hovered.cx}
                cy={hovered.cy}
                r={9}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </g>
        )}

        {/* Axes: ticks + labels in muted ink. */}
        <line x1={PAD.l} y1={PAD.t + PLOT_H} x2={PAD.l + PLOT_W} y2={PAD.t + PLOT_H} stroke="#383835" strokeWidth={1} />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + PLOT_H} stroke="#383835" strokeWidth={1} />
        {[-2, -1, 0, 1, 2].map((x) => (
          <text key={`tx${x}`} x={sx(x)} y={PAD.t + PLOT_H + 14} textAnchor="middle" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
            {x}
          </text>
        ))}
        {[1, 2, 3, 4].map((z) => (
          <text key={`tz${z}`} x={PAD.l - 8} y={sz(z) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
            {z}
          </text>
        ))}
        <text x={PAD.l + PLOT_W / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={MUTED} letterSpacing={1}>
          HORIZONTAL FT — CATCHER&apos;S VIEW
        </text>
        <text x={12} y={PAD.t + PLOT_H / 2} textAnchor="middle" fontSize={9} fill={MUTED} letterSpacing={1} transform={`rotate(-90 12 ${PAD.t + PLOT_H / 2})`}>
          HEIGHT FT
        </text>

        {located.length === 0 && (
          <text x={PAD.l + PLOT_W / 2} y={PAD.t + PLOT_H / 2} textAnchor="middle" fontSize={12} fill={MUTED}>
            0 PITCHES IN SLICE
          </text>
        )}
      </svg>

      {/* Tooltip — value leads, series key is a colored stroke, never colored text. */}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 border border-line bg-bg px-2.5 py-2 text-[10px] leading-4 whitespace-nowrap"
          style={{
            left: `${(tip.cx / W) * 100}%`,
            top: `${(tip.cy / H) * 100}%`,
            transform: `translate(-50%, ${tip.cy < H * 0.28 ? "14px" : "calc(-100% - 12px)"})`,
          }}
        >
          <p className="flex items-center gap-1.5 font-bold text-ink">
            {tip.color && (
              <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: tip.color }} />
            )}
            {tip.title}
          </p>
          {tip.lines.map((l) => (
            <p key={l.label} className="flex justify-between gap-4">
              <span className="text-ink-3">{l.label}</span>
              <span className="font-bold text-ink tabular-nums">{l.value}</span>
            </p>
          ))}
        </div>
      )}

      {/* Legend: scatter = series identity (color + shape); heat = scale. */}
      {mode === "scatter" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-grid px-1 pt-2 text-[10px] text-ink-2">
          {series.map(([code, n]) => {
            const slot = code === "OTH" ? slotFor(null) : PITCH_SLOTS[code];
            return (
              <span key={code} className="flex items-center gap-1.5">
                <svg width={12} height={12} viewBox="-6 -6 12 12" aria-hidden>
                  <Mark shape={slot.shape} cx={0} cy={0} color={slot.color} r={3.4} />
                </svg>
                {code} <span className="text-ink-3">{n.toLocaleString()}</span>
              </span>
            );
          })}
          {located.length > MAX_POINTS && (
            <span className="ml-auto text-ink-3">
              LATEST {MAX_POINTS.toLocaleString()} OF {located.length.toLocaleString()} PLOTTED
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-grid px-1 pt-2 text-[10px] text-ink-3">
          <span>0</span>
          <span className="inline-block h-3 w-4 border border-grid" style={{ background: SURFACE }} aria-hidden />
          {HEAT_RAMP.map((c) => (
            <span key={c} className="inline-block h-3 w-4" style={{ background: c }} aria-hidden />
          ))}
          <span className="tabular-nums">{heat?.max ?? 0} MAX / CELL</span>
        </div>
      )}
    </div>
  );
}
