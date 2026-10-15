"use client";

import { useMemo, useState } from "react";
import type { Pitch } from "@/lib/api";
import type { LeagueRates } from "@/lib/advanced";
import {
  WINDOWS,
  gameLines,
  rollText,
  rolling,
  seasonRate,
  type RollMetric,
} from "@/lib/rolling";
import Panel from "@/components/ui/Panel";
import SegmentedControl from "@/components/ui/SegmentedControl";

/*
 * How a season went, not just where it ended: the player's xwOBA or K% over
 * a trailing window — his last 15/30/50 games, or for a pitcher his last
 * 50/100/250 batters faced — at every point of the year, read against his
 * own season figure (dashed) and the league's (dotted). Pointer over the
 * chart names the window under it.
 *
 * For a pitcher both are what he allowed — down is good for xwOBA, up for K%.
 */

const W = 600;
const H = 150;

/* The two reference lines are told apart by dash, not colour, and the
   read-out above draws each one's dash beside its name — the legend. */
const SEASON_DASH = "6 4";
const LEAGUE_DASH = "1 4";

const Swatch = ({ dash }: { dash: string }) => (
  <svg aria-hidden viewBox="0 0 16 2" className="mr-1 inline h-0.5 w-4 align-middle">
    <line x1={0} y1={1} x2={16} y2={1} className="stroke-ink-2" strokeWidth={2} strokeDasharray={dash} />
  </svg>
);

export default function RollingChart({
  pitches,
  league,
  role,
  season,
}: {
  pitches: Pitch[];
  league: LeagueRates | null;
  role: "pitcher" | "batter";
  season: number;
}) {
  const [metric, setMetric] = useState<RollMetric>("xwoba");
  const win = WINDOWS[role];
  const [n, setN] = useState<number>(win.initial);
  const [at, setAt] = useState<number | null>(null);

  const games = useMemo(() => gameLines(pitches, role), [pitches, role]);
  const points = useMemo(() => rolling(games, n, metric), [games, n, metric]);
  const avg = seasonRate(games, metric);
  const lg = league?.[metric] ?? null;

  const label = metric === "k" ? "K%" : "xwOBA";
  const controls = (
    <div className="flex flex-wrap gap-2">
      <SegmentedControl<RollMetric>
        ariaLabel="Rolling stat"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "xwoba", label: "xwOBA" },
          { value: "k", label: "K%" },
        ]}
      />
      <SegmentedControl<number>
        ariaLabel="Window"
        value={n}
        onChange={(v) => {
          setN(v);
          setAt(null);
        }}
        options={win.sizes.map((w) => ({ value: w, label: `${w} ${win.unit}` }))}
      />
    </div>
  );

  if (points.length === 0)
    return (
      <Panel title="Rolling Form" right={controls}>
        <p className="text-xs text-ink-3">
          FEWER THAN {n} {role === "pitcher" ? "BATTERS FACED" : "GAMES PLAYED"} IN {season}
        </p>
      </Panel>
    );

  /* The y range is the line and both reference marks, padded so none rides
     the panel's edge. */
  const vals = points.map((p) => p.value).concat(avg ?? [], lg ?? []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || hi || 1) * 0.12;
  const y = (v: number) => H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const last = points.length - 1;
  const x = (i: number) => (last ? (i / last) * W : W / 2);

  const shown = points[at ?? last];
  const track = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * last);
    setAt(Math.min(last, Math.max(0, i)));
  };

  return (
    <Panel title="Rolling Form" right={controls}>
      <div className="space-y-2">
        <p className="text-[10px] tracking-wider text-ink-3">
          LAST {n} {win.unit} THRU {shown.date} ·{" "}
          {role === "batter" && <>{shown.pa} PA · </>}
          <span className="text-xs tabular-nums text-ink">
            {label} {rollText(metric, shown.value)}
          </span>
          {avg !== null && (
            <>
              {" · "}
              <Swatch dash={SEASON_DASH} />
              SEASON {rollText(metric, avg)}
            </>
          )}
          {lg !== null && (
            <>
              {" · "}
              <Swatch dash={LEAGUE_DASH} />
              LEAGUE {rollText(metric, lg)}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <div className="flex w-10 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-ink-3">
            <span>{rollText(metric, hi + pad)}</span>
            <span>{rollText(metric, lo - pad)}</span>
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-36 min-w-0 flex-1 border-b border-l border-grid"
            preserveAspectRatio="none"
            onMouseMove={track}
            onMouseLeave={() => setAt(null)}
            role="img"
            aria-label={`Rolling ${n}-${role === "pitcher" ? "batter" : "game"} ${label}, now ${rollText(metric, points[last].value)}${
              avg !== null ? `, season ${rollText(metric, avg)}` : ""
            }${lg !== null ? `, league ${rollText(metric, lg)}` : ""}`}
          >
            {avg !== null && (
              <line
                x1={0}
                y1={y(avg)}
                x2={W}
                y2={y(avg)}
                className="stroke-ink-2"
                strokeWidth={1}
                strokeDasharray={SEASON_DASH}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {lg !== null && (
              <line
                x1={0}
                y1={y(lg)}
                x2={W}
                y2={y(lg)}
                className="stroke-ink-2"
                strokeWidth={1.5}
                strokeDasharray={LEAGUE_DASH}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <polyline
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
              fill="none"
              className="stroke-accent"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {at !== null && (
              /* A rule rather than a dot: the chart stretches to its box, so
                 anything round comes out an ellipse. */
              <line
                x1={x(at)}
                y1={0}
                x2={x(at)}
                y2={H}
                className="stroke-ink"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>
        <div className="flex justify-between pl-12 text-[10px] tabular-nums text-ink-3">
          <span>{points[0].date}</span>
          <span>{points[last].date}</span>
        </div>
      </div>
    </Panel>
  );
}
