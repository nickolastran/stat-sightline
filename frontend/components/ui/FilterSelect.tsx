"use client";

/*
 * One control of a client-side filter bar — the kind that narrows rows
 * already held rather than re-asking the server, so it owns no URL state.
 * (ParamSelect is the other kind.) A dropdown's empty option is its own
 * label, which is how a bar of them reads as a row of filters rather than a
 * row of unlabelled boxes.
 */

/** The chrome every control in such a bar shares — selects, inputs, buttons. */
export const FILTER_CONTROL =
  "h-7 border border-line bg-bg px-2 text-[10px] tracking-wider text-ink placeholder:text-ink-3 hover:border-accent focus:border-accent focus:outline-none";

export default function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  /* Nothing to choose between is no control at all — a 1990 draft has no
     school states on it, and an empty dropdown is a dead box. */
  if (options.length === 0) return null;
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${FILTER_CONTROL} ${value ? "border-accent text-ink" : "text-ink-3"}`}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
