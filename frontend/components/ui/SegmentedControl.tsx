"use client";

/*
 * Generic segmented toggle — one value active at a time. Used for view
 * modes and enumerable filters (balls, strikes, batter side).
 */
interface Option<V> {
  value: V;
  label: string;
}

interface Props<V> {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  /** "lg" for a control that heads a whole view rather than sitting in a filter row. */
  size?: "sm" | "lg";
}

export default function SegmentedControl<V extends string | number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
}: Props<V>) {
  const pad = size === "lg" ? "px-4 py-2 text-xs" : "px-2 py-1 text-[11px]";
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-px">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`border tracking-wide ${pad} ${
              active
                ? "border-accent bg-accent/15 font-bold text-ink"
                : "border-line text-ink-3 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
