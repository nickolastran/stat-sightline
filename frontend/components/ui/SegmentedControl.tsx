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
  /** "underline" for a page's top-level tab strip — a rule under the active
   *  one rather than a boxed button, so the tabs read as navigation. */
  variant?: "box" | "underline";
  /** Extra classes for the strip itself — the game page insets its buttons
   *  while leaving the rule to run the full width of the view below. */
  className?: string;
}

export default function SegmentedControl<V extends string | number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  variant = "box",
  className = "",
}: Props<V>) {
  const pad = size === "lg" ? "px-4 py-2 text-xs" : "px-2 py-1 text-[11px]";
  const underline = variant === "underline";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${
        underline
          ? "flex flex-wrap gap-1 border-b border-line"
          : "flex flex-wrap gap-px"
      } ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={
              underline
                ? `-mb-px border-b-2 tracking-[0.2em] ${pad} ${
                    active
                      ? "border-accent font-bold text-ink"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`
                : `border tracking-wide ${pad} ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-ink"
                      : "border-line text-ink-3 hover:bg-surface-2 hover:text-ink"
                  }`
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
