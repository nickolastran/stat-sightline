"use client";

import {
  CartesianGrid,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Pitch } from "@/lib/api";

/**
 * Reusable strike-zone scatter plot.
 * Maps plate_x (horizontal, ft) vs plate_z (height, ft) from the catcher's
 * view, grouped + colored by pitch type, over a drawn rulebook strike zone.
 */

// Rulebook strike zone (ft). Horizontal half-width ~0.83; vertical is the
// league-average zone (varies per batter, fixed here for the backdrop).
const ZONE = { xMin: -0.83, xMax: 0.83, zMin: 1.5, zMax: 3.5 };

// Stable color per pitch type (Savant-ish palette).
const PITCH_COLORS: Record<string, string> = {
  FF: "#d22d49", // four-seam
  SI: "#fe9d00", // sinker
  FC: "#933f2c", // cutter
  SL: "#eee716", // slider
  ST: "#ddb33a", // sweeper
  CU: "#00d1ed", // curve
  KC: "#311d8b", // knuckle curve
  CH: "#1dbe3a", // change
  FS: "#3bacac", // splitter
};
const colorFor = (pt: string) => PITCH_COLORS[pt] ?? "#9ca3af";

interface Props {
  pitches: Pitch[];
  height?: number;
}

export default function PitchChart({ pitches, height = 480 }: Props) {
  // Group located pitches by pitch type -> one <Scatter> series each.
  const byType = new Map<string, { x: number; y: number; v: number; name: string }[]>();
  for (const p of pitches) {
    if (p.plate_x == null || p.plate_z == null) continue;
    const key = p.pitch_type ?? "NA";
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push({
      x: p.plate_x,
      y: p.plate_z,
      v: p.release_speed ?? 0,
      name: p.pitch_name ?? key,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid strokeOpacity={0.1} />
        {/* Strike zone backdrop */}
        <ReferenceArea
          x1={ZONE.xMin}
          x2={ZONE.xMax}
          y1={ZONE.zMin}
          y2={ZONE.zMax}
          fill="#ffffff"
          fillOpacity={0.06}
          stroke="#ffffff"
          strokeOpacity={0.4}
        />
        <XAxis
          type="number"
          dataKey="x"
          name="plate_x"
          unit="ft"
          domain={[-2.5, 2.5]}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          label={{ value: "Horizontal (ft, catcher view)", position: "bottom", fill: "#94a3b8" }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="plate_z"
          unit="ft"
          domain={[0, 5]}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          label={{ value: "Height (ft)", angle: -90, position: "left", fill: "#94a3b8" }}
        />
        <ZAxis type="number" dataKey="v" range={[36, 36]} name="velo" unit="mph" />
        <Tooltip cursor={{ strokeOpacity: 0.2 }} />
        <Legend />
        {[...byType.entries()].map(([pt, data]) => (
          <Scatter key={pt} name={pt} data={data} fill={colorFor(pt)} fillOpacity={0.7} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
