/*
 * Stat tile: micro-label on top, big proportional-figure value, optional
 * unit + context line. Values arrive pre-formatted (see lib/metrics fmt)
 * so a missing stat renders as "—", never NaN.
 */
interface Props {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** The change from a comparison slice, and that slice's value; `tone`
   *  colors good or bad news, `note` flags a thin sample. */
  change?: { delta: string; was: string; tone?: "good" | "bad" | null; note?: string };
}

export default function MetricCard({ label, value, unit, sub, change }: Props) {
  return (
    <div className="border border-line bg-surface p-3">
      <p className="text-[10px] tracking-[0.2em] text-ink-3">{label}</p>
      <p className="mt-2 text-2xl font-bold leading-none text-ink">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-ink-3">{unit}</span>
        )}
      </p>
      {change && (
        <p className="mt-1.5 text-[11px] tabular-nums">
          <span
            className={`font-bold ${
              change.tone === "good" ? "text-good" : change.tone === "bad" ? "text-crit" : "text-ink-2"
            }`}
          >
            {change.delta}
          </span>
          <span className="ml-1 text-ink-3">FROM {change.was}</span>
          {change.note && <span className="ml-1 text-ink-3">· {change.note}</span>}
        </p>
      )}
      {sub && <p className="mt-2 text-[10px] text-ink-3">{sub}</p>}
    </div>
  );
}
