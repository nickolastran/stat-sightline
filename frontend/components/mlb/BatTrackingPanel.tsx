import type { Pitch } from "@/lib/api";
import { competitiveSwings, histogram, type BatLine } from "@/lib/batTracking";

/*
 * A hitter's bat tracking against the league: six figures as tiles, then the
 * spread of his competitive swings by bat speed and by swing length — the
 * average alone hides whether a 72 mph hitter lives at 72 or swings 65 and
 * 80. Each chart is one series, so it has no legend; the two rules on it are
 * labelled where they stand. Bars carry their count on hover.
 */

const TILES: { key: keyof BatLine; label: string; fmt: (v: number) => string }[] = [
  { key: "batSpeed", label: "BAT SPEED", fmt: (v) => `${v.toFixed(1)} mph` },
  { key: "swingLength", label: "SWING LENGTH", fmt: (v) => `${v.toFixed(1)} ft` },
  { key: "squaredPerSwing", label: "SQUARED-UP / SWING", fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "squaredPerContact", label: "SQUARED-UP / CONTACT", fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "blastPerSwing", label: "BLAST / SWING", fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "hardSwingRate", label: "FAST SWING (75+)", fmt: (v) => `${(v * 100).toFixed(1)}%` },
];

const W = 320;
const H = 120;
const PAD_TOP = 18; // room for the rule labels

function Histogram({
  title,
  values,
  lo,
  step,
  bins,
  unit,
  mine,
  league,
}: {
  title: string;
  values: number[];
  lo: number;
  step: number;
  bins: number;
  unit: string;
  mine: number;
  league: number;
}) {
  const counts = histogram(values, lo, step, bins);
  const max = Math.max(...counts, 1);
  const bw = W / bins;
  const x = (v: number) => Math.min(W, Math.max(0, ((v - lo) / step) * bw));
  const y = (n: number) => H - (n / max) * (H - PAD_TOP);
  /* "52.5", "4.25", "60" — as many places as the bin edge needs. */
  const edge = (i: number) => String(+(lo + i * step).toFixed(2));
  /* The two labels pull apart when the rules sit close. */
  const apart = Math.abs(x(mine) - x(league)) < 44;
  const rule = (v: number, label: string, cls: string, dash: boolean, anchorEnd: boolean) => (
    <g>
      <line
        x1={x(v)} x2={x(v)} y1={PAD_TOP - 4} y2={H}
        className={cls} strokeWidth={2} strokeDasharray={dash ? "4 3" : undefined}
      />
      <text
        x={x(v) + (anchorEnd ? -3 : 3)} y={PAD_TOP - 7}
        textAnchor={anchorEnd ? "end" : "start"}
        className="fill-ink-2 text-[10px] tabular-nums"
      >
        {label} {v.toFixed(1)}
      </text>
    </g>
  );

  return (
    <figure className="min-w-0 flex-1 space-y-1">
      <figcaption className="text-[10px] tracking-widest text-ink-3">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img"
        aria-label={`${title}: his average ${mine.toFixed(1)} ${unit}, league ${league.toFixed(1)}`}
      >
        {counts.map((n, i) => (
          <g key={i}>
            {/* The full column is the hover target, not just the bar. */}
            <rect x={i * bw} y={PAD_TOP} width={bw} height={H - PAD_TOP} fill="transparent">
              <title>{`${edge(i)}–${edge(i + 1)} ${unit}: ${n} swings`}</title>
            </rect>
            {n > 0 && (
              <rect
                x={i * bw + 1} y={y(n)} width={bw - 2} height={H - y(n)} rx={1}
                className="pointer-events-none fill-ink-3 opacity-60"
              />
            )}
          </g>
        ))}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-line" strokeWidth={1} />
        {rule(league, "LG", "stroke-ink-3", true, apart ? league < mine : x(league) > W - 60)}
        {rule(mine, "HIM", "stroke-accent", false, apart ? mine < league : x(mine) > W - 60)}
        {[0, Math.floor(bins / 2), bins].map((i) => (
          <text key={i} x={Math.min(W - 1, Math.max(1, i * bw))} y={H + 12}
            textAnchor={i === 0 ? "start" : i === bins ? "end" : "middle"}
            className="fill-ink-3 text-[9px] tabular-nums"
          >
            {edge(i)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

export default function BatTrackingPanel({
  pitches,
  line,
}: {
  pitches: Pitch[];
  line: { player: BatLine; league: BatLine };
}) {
  const swings = competitiveSwings(pitches);
  const { player, league } = line;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((t) => {
          const diff = player[t.key] - league[t.key];
          return (
            <div key={t.key} className="border border-line bg-bg px-2 py-1.5">
              <dt className="text-[9px] tracking-widest text-ink-3">{t.label}</dt>
              <dd className="text-sm font-bold tabular-nums text-ink">{t.fmt(player[t.key])}</dd>
              <dd className="text-[10px] tabular-nums text-ink-3">
                LG {t.fmt(league[t.key])} · {diff >= 0 ? "▲" : "▼"}
              </dd>
            </div>
          );
        })}
      </dl>
      {swings.length === 0 ? (
        <p className="text-xs text-ink-3">NO TRACKED SWINGS</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <Histogram
            title={`BAT SPEED · ${swings.length.toLocaleString()} COMPETITIVE SWINGS`}
            values={swings.map((p) => p.bat_speed!)}
            lo={50} step={2.5} bins={18} unit="mph"
            mine={player.batSpeed} league={league.batSpeed}
          />
          <Histogram
            title="SWING LENGTH"
            values={swings.filter((p) => p.swing_length != null).map((p) => p.swing_length!)}
            lo={4} step={0.25} bins={24} unit="ft"
            mine={player.swingLength} league={league.swingLength}
          />
        </div>
      )}
    </div>
  );
}
