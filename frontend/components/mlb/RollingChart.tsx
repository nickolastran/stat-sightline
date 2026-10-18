"use client";

import { useMemo, useState } from "react";
import type { LeagueRates } from "@/lib/advanced";
import {
  WINDOWS,
  rollText,
  rolling,
  seasonRate,
  type GameLine,
  type RollMetric,
  type RollPoint,
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
 * Handed several players (the compare page), it draws one line each on a
 * shared scale, lined up by game — or batter faced — rather than by date:
 * "through his 80th game" is the comparison, and a pitcher's batters faced
 * pile up on one date. Each one's season figure moves into the read-out.
 *
 * For a pitcher both are what he allowed — down is good for xwOBA, up for K%.
 */

const W = 600;
const H = 150;

/* The two reference lines are told apart by dash, not colour, and the
   read-out above draws each one's dash beside its name — the legend. */
const SEASON_DASH = "6 4";
const LEAGUE_DASH = "1 4";

/* One per compared player, in the order they were picked: the first four
   categorical slots, validated as lines (adjacent pairs) on the white chart
   surface. Slot 1 is the accent, so a lone player reads as he always has. */
const COLORS = ["var(--color-accent)", "#eb6834", "#1baf7a", "#eda100"];

const Swatch = ({ dash, color }: { dash?: string; color?: string }) => (
  <svg aria-hidden viewBox="0 0 16 2" className="mr-1 inline h-0.5 w-4 align-middle">
    <line
      x1={0}
      y1={1}
      x2={16}
      y2={1}
      className={color ? undefined : "stroke-ink-2"}
      style={color ? { stroke: color } : undefined}
      strokeWidth={2}
      strokeDasharray={dash}
    />
  </svg>
);

export interface RollSeries {
  name: string;
  games: GameLine[];
}

export default function RollingChart({
  series,
  league,
  role,
  season,
}: {
  series: RollSeries[];
  league: LeagueRates | null;
  role: "pitcher" | "batter";
  season: number;
}) {
  const [metric, setMetric] = useState<RollMetric>("xwoba");
  const win = WINDOWS[role];
  const [n, setN] = useState<number>(win.initial);
  const [at, setAt] = useState<number | null>(null);

  const lines = useMemo(
    () =>
      series.map((s, i) => ({
        name: s.name,
        color: COLORS[i],
        points: rolling(s.games, n, metric),
        avg: seasonRate(s.games, metric),
      })),
    [series, n, metric],
  );
  const solo = lines.length === 1;
  const lg = league?.[metric] ?? null;

  const label = metric === "k" ? "K%" : "xwOBA";
  const title = solo ? "Rolling Form" : `Rolling Form — ${season}`;
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

  const drawn = lines.filter((l) => l.points.length);
  if (drawn.length === 0)
    return (
      <Panel title={title} right={controls}>
        <p className="text-xs text-ink-3">
          FEWER THAN {n} {role === "pitcher" ? "BATTERS FACED" : "GAMES PLAYED"} IN {season}
        </p>
      </Panel>
    );

  /* The y range is every line and the reference marks, padded so none rides
     the panel's edge. */
  const vals = lines
    .flatMap((l) => l.points.map((p) => p.value))
    .concat(solo && lines[0].avg !== null ? [lines[0].avg] : [], lg ?? []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || hi || 1) * 0.12;
  const y = (v: number) => H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  /* x is the unit a window ends on — the first full window at the left, the
     furthest anyone got at the right. */
  const end = Math.max(...drawn.map((l) => l.points.at(-1)!.unit));
  const span = end - n;
  const x = (u: number) => (span ? ((u - n) / span) * W : W / 2);

  const unit = at ?? end;
  /** The window ending on the unit under the pointer — or a line's last one,
   *  for a player whose season stopped short of it. */
  const under = (pts: RollPoint[]) => pts.findLast((p) => p.unit <= unit) ?? null;
  const track = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const u = n + Math.round(((e.clientX - box.left) / box.width) * span);
    setAt(Math.min(end, Math.max(n, u)));
  };

  const avg = solo ? lines[0].avg : null;
  const shown = under(lines[0].points);
  const now = (l: (typeof lines)[number]) =>
    l.points.length ? rollText(metric, l.points.at(-1)!.value) : "none";

  return (
    <Panel title={title} right={controls}>
      <div className="space-y-2">
        {solo && shown ? (
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
        ) : (
          /* The legend: each player's swatch, name, window and season. */
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tracking-wider text-ink-3">
            <span>
              LAST {n} {win.unit} THRU {win.unit} {unit}
            </span>
            {lines.map((l, i) => {
              const p = under(l.points);
              return (
                <span key={i}>
                  <Swatch color={l.color} />
                  {l.name.toUpperCase()}{" "}
                  <span className="text-xs tabular-nums text-ink">
                    {p ? `${label} ${rollText(metric, p.value)}` : "—"}
                  </span>
                  {l.avg !== null && <> · SEASON {rollText(metric, l.avg)}</>}
                </span>
              );
            })}
            {lg !== null && (
              <span>
                <Swatch dash={LEAGUE_DASH} />
                LEAGUE {rollText(metric, lg)}
              </span>
            )}
          </p>
        )}
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
            aria-label={
              solo
                ? `Rolling ${n}-${role === "pitcher" ? "batter" : "game"} ${label}, now ${now(lines[0])}${
                    avg !== null ? `, season ${rollText(metric, avg)}` : ""
                  }${lg !== null ? `, league ${rollText(metric, lg)}` : ""}`
                : `Rolling ${n}-${role === "pitcher" ? "batter" : "game"} ${label}: ${lines
                    .map((l) => `${l.name} ${now(l)}`)
                    .join(", ")}${lg !== null ? `; league ${rollText(metric, lg)}` : ""}`
            }
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
            {lines.map((l, i) => (
              <polyline
                key={i}
                points={l.points.map((p) => `${x(p.unit)},${y(p.value)}`).join(" ")}
                fill="none"
                style={{ stroke: l.color }}
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
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
          {solo ? (
            <>
              <span>{lines[0].points[0].date}</span>
              <span>{lines[0].points.at(-1)!.date}</span>
            </>
          ) : (
            <>
              <span>
                {win.unit} {n}
              </span>
              <span>
                {win.unit} {end}
              </span>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
