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
}

export default function MetricCard({ label, value, unit, sub }: Props) {
  return (
    <div className="border border-line bg-surface p-3">
      <p className="text-[10px] tracking-[0.2em] text-ink-3">{label}</p>
      <p className="mt-2 text-2xl font-bold leading-none text-ink">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-ink-3">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-2 text-[10px] text-ink-3">{sub}</p>}
    </div>
  );
}
