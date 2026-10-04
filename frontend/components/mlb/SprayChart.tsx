"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import type { HitKind, Park, SprayHit } from "@/lib/spray";

/*
 * A batter's hits where they landed, drawn on their own club's park — the
 * wall at MLB's listed distances down each line, to each gap and to center.
 * Every season ships at once, so the dropdown is a filter, not a fetch: the
 * career is every dot, a year is its own.
 */

const KINDS: { kind: HitKind; label: string; color: string }[] = [
  { kind: "single", label: "SINGLE", color: "#2a78d6" },
  { kind: "double", label: "DOUBLE", color: "#eb6834" },
  { kind: "triple", label: "TRIPLE", color: "#1baf7a" },
  { kind: "home_run", label: "HOME RUN", color: "#eda100" },
];
const COLOR = Object.fromEntries(KINDS.map((k) => [k.kind, k.color]));
const LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));

/* A park MLB lists no dimensions for still gets a field to land on. */
const GENERIC: Park = {
  name: "a standard park",
  walls: [330, 375, 400, 375, 330],
};

const ANCHORS = [-45, -22.5, 0, 22.5, 45];
const rad = (deg: number) => (deg * Math.PI) / 180;

/** The wall's distance at an angle off center field, between the listed ones. */
function wallAt(walls: Park["walls"], deg: number): number {
  const i = Math.min(3, Math.floor((deg + 45) / 22.5));
  const t = (deg - ANCHORS[i]) / 22.5;
  return walls[i] + (walls[i + 1] - walls[i]) * t;
}

/** Feet off home plate to SVG space, center field up. */
const pt = (d: number, deg: number): [number, number] => [
  d * Math.sin(rad(deg)),
  -d * Math.cos(rad(deg)),
];

function Field({ park }: { park: Park }) {
  const wall = Array.from({ length: 91 }, (_, i) =>
    pt(wallAt(park.walls, i - 45), i - 45),
  );
  const fair = `0,0 ${wall.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}`;
  const base = (x: number, y: number) => (
    <rect
      x={x - 4}
      y={-y - 4}
      width={8}
      height={8}
      fill="#fff"
      transform={`rotate(45 ${x} ${-y})`}
    />
  );
  return (
    <g>
      <defs>
        <clipPath id="spray-fair">
          <polygon points={fair} />
        </clipPath>
      </defs>
      <polygon
        points={fair}
        fill="#dfe8e1"
        stroke="var(--color-ink-3)"
        strokeWidth={2}
      />
      {/* The infield dirt: the arc 95 feet round the mound, inside the lines. */}
      <circle
        cx={0}
        cy={-60.5}
        r={95}
        fill="#ece4d4"
        clipPath="url(#spray-fair)"
      />
      <polygon points="0,-10 54,-63.6 0,-117 -54,-63.6" fill="#dfe8e1" />
      <circle cx={0} cy={0} r={13} fill="#ece4d4" />
      {[wall[0], wall[90]].map(([x, y]) => (
        <line
          key={x}
          x1={0}
          y1={0}
          x2={x}
          y2={y}
          stroke="#fff"
          strokeWidth={2}
        />
      ))}
      {base(63.6, 63.6)}
      {base(0, 127.3)}
      {base(-63.6, 63.6)}
    </g>
  );
}

/** The listed distances, drawn over the dots so a hit never hides one. */
function Dims({ park }: { park: Park }) {
  return (
    <g>
      {park.walls.map((d, i) => {
        const [x, y] = pt(d + 22, ANCHORS[i]);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={15}
            fill="var(--color-ink-2)"
            stroke="var(--color-surface)"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {d}
          </text>
        );
      })}
    </g>
  );
}

export default function SprayChart({
  hits,
  park,
  title,
}: {
  hits: SprayHit[];
  park: Park | null;
  /** Overrides the season-named heading — the landing rail names the batter. */
  title?: string;
}) {
  const seasons = [...new Set(hits.map((h) => h.season))].sort((a, b) => b - a);
  const [pick, setPick] = useState<string>(String(seasons[0] ?? "career"));
  const shown =
    pick === "career" ? hits : hits.filter((h) => String(h.season) === pick);
  const field = park ?? GENERIC;

  return (
    <Panel
      className="@container"
      title={title ?? `${pick === "career" ? "Career" : pick} Hits Spray Chart`}
      right={
        seasons.length > 1 && (
          <label className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
            SEASON
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="border border-line bg-bg px-1.5 py-0.5 text-[10px] tracking-normal text-ink hover:border-accent"
            >
              <option value="career">CAREER</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )
      }
    >
      {hits.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-3">
          NO BATTED-BALL DATA ON RECORD
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 @lg:flex-row @lg:items-start @lg:justify-center">
          <svg
            viewBox="-360 -500 720 530"
            className="w-full max-w-xl"
            role="img"
            aria-label={`${shown.length} hits on ${field.name}`}
          >
            <Field park={field} />
            {shown.map((h, i) => (
              <circle
                key={i}
                cx={h.x}
                cy={-h.y}
                r={6}
                fill={COLOR[h.kind]}
                stroke="#16150f"
                strokeOpacity={0.55}
                strokeWidth={1}
              >
                <title>
                  {[LABEL[h.kind], h.date, h.feet !== null && `${h.feet} FT`]
                    .filter(Boolean)
                    .join(" · ")}
                </title>
              </circle>
            ))}
            <Dims park={field} />
          </svg>
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {KINDS.map((k) => (
                <li
                  key={k.kind}
                  className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-ink-2"
                >
                  <span
                    className="h-2.5 w-2.5 border border-ink/50"
                    style={{ background: k.color, borderRadius: "50%" }}
                  />
                  <span className="w-20">{k.label}</span>
                  <span className="tabular-nums text-ink">
                    {shown.filter((h) => h.kind === k.kind).length}
                  </span>
                </li>
              ))}
            </ul>
            <p className="max-w-[12rem] text-[10px] text-ink-3">
              Drawn on {field.name}. Regular season, Statcast-tracked hits.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
