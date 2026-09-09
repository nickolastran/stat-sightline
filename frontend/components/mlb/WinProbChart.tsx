"use client";

import { useState } from "react";
import type { Game, PlayProb } from "@/lib/mlb";

/*
 * Win probability, play by play. The line is the home club's number as MLB
 * reports it; the fill between it and the even line is who was holding the
 * game at that point, black when the home club had it and light grey when the
 * visitors did.
 *
 * The axis reads 100 out from the middle in both directions, because a chart
 * of one club's chances is a chart of both: the club a point sits nearer to
 * is the one whose figure is worth quoting, so every read-out names the club
 * that is ahead and gives its own percentage rather than the home club's.
 *
 * A client component for one reason: running the pointer along the chart has
 * to name the play under it, and that read-out is the whole point of the
 * panel — a chart that only shows the current number is the scoreboard again.
 */

const W = 600;
const H = 150;
/* The home club reads along the bottom, the way a home line score does — so
   the axis runs the other way, 100 for the home club at y = H. */
const y = (prob: number) => (prob / 100) * H;

/** Who a play left in front, and by how much — the home club's number read
 *  from whichever end of the axis it is nearer. */
const edge = (game: Game, p: PlayProb) =>
  p.homeProb >= 50
    ? { side: game.home.abbr, pct: p.homeProb }
    : { side: game.away.abbr, pct: 100 - p.homeProb };

export default function WinProbChart({
  game,
  plays,
}: {
  game: Game;
  plays: PlayProb[];
}) {
  const [at, setAt] = useState<number | null>(null);
  const last = plays.length - 1;
  const step = plays.length > 1 ? W / last : 0;
  const pt = (p: PlayProb, i: number) => `${i * step},${y(p.homeProb)}`;

  /* One closed shape from the even line out to the curve and back. Where the
     curve crosses, each lobe closes on its own, so both sides fill. */
  const area = `M 0,${y(50)} L ${plays.map(pt).join(" L ")} L ${last * step},${y(50)} Z`;

  /* The at-bat under way is in the log already with nothing to say about
     itself yet, so the resting read-out is the last play that finished. */
  const shown =
    at !== null
      ? plays[at]
      : ([...plays].reverse().find((p) => p.description) ?? plays[last]);

  /* One tick where each inning starts — the x axis is plays, but a reader
     counts in innings. */
  const innings = plays
    .map((p, i) => ({ i, p }))
    .filter(({ i, p }) => i === 0 || p.inning !== plays[i - 1].inning);

  const track = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * last);
    setAt(Math.min(last, Math.max(0, i)));
  };

  return (
    <div className="space-y-2">
      <p className="text-right text-xs tabular-nums text-ink">
        {edge(game, shown).side} {edge(game, shown).pct.toFixed(1)}%
      </p>
      <div className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col justify-between text-[10px] tracking-wider text-ink-3">
          <span>{game.away.abbr}</span>
          <span>EVEN</span>
          <span>{game.home.abbr}</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-28 min-w-0 flex-1"
          preserveAspectRatio="none"
          onMouseMove={track}
          onMouseLeave={() => setAt(null)}
          role="img"
          aria-label={`Win probability by play, now ${edge(game, plays[last]).side} ${edge(game, plays[last]).pct.toFixed(1)} percent`}
        >
          <defs>
            {/* One vertical ramp does both sides: light grey where the
                visitors hold the game, black where the home club does, fading
                out at the even line so neither lobe bleeds across it. */}
            <linearGradient id="wp-advantage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9a9790" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#9a9790" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--color-ink)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#wp-advantage)" />
          <line x1={0} y1={y(50)} x2={W} y2={y(50)} className="stroke-grid" strokeWidth={2} />
          {innings.map(({ i, p }) => (
            <line
              key={`${p.inning}-${i}`}
              x1={i * step}
              y1={0}
              x2={i * step}
              y2={H}
              className="stroke-grid"
              strokeWidth={1}
              strokeDasharray="3 5"
            />
          ))}
          <polyline
            points={plays.map(pt).join(" ")}
            fill="none"
            className="stroke-accent"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
          {at !== null && (
            /* A rule rather than a dot: the chart is drawn to fill its box,
               so anything round comes out an ellipse. */
            <line
              x1={at * step}
              y1={0}
              x2={at * step}
              y2={H}
              className="stroke-ink"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Certainty at both ends, a coin flip in the middle. */}
        <div className="flex w-7 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-ink-3">
          <span>100</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      {/* Whole play, however long — with a floor deep enough that the panel
          doesn't jump as the pointer runs along the chart. */}
      <p className="min-h-[4.25rem] border border-line bg-bg px-2 py-1.5 text-[11px] text-ink-2">
        <span className="mr-2 text-[10px] tracking-wider text-ink-3">
          {shown.half === "top" ? "TOP" : "BOT"} {shown.inning} ·{" "}
          {game.away.abbr} {shown.awayScore}-{shown.homeScore} {game.home.abbr} ·{" "}
          <span className="text-ink-2">
            {edge(game, shown).side} {edge(game, shown).pct.toFixed(1)}%
          </span>
        </span>
        {shown.description || "AT BAT"}
      </p>
    </div>
  );
}
