"use client";

import type { FilterState } from "@/lib/filters";
import { PITCH_SLOTS, slotFor } from "@/lib/pitchColors";
import SegmentedControl from "@/components/ui/SegmentedControl";

/*
 * The one filter scope for the whole dashboard: every card, plot, and table
 * to the right renders from the slice this panel defines. Changes apply
 * instantly (client-side filtering — no refetch).
 */

export interface PitchTypeOption {
  code: string; // slot code or "OTH"
  name: string;
  count: number;
}

interface Props {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  pitchTypeOptions: PitchTypeOption[];
  dateExtent: { min: string; max: string } | null;
  sliceCount: number;
  totalCount: number;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-grid px-3 py-3">
      <h3 className="mb-2 text-[10px] tracking-[0.25em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

/* ISO date n days before `max`, clamped to `min`. */
const daysBack = (max: string, min: string, days: number) => {
  const d = new Date(`${max}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  const iso = d.toISOString().slice(0, 10);
  return iso < min ? min : iso;
};

export default function FilterPanel({
  filters,
  onChange,
  onReset,
  pitchTypeOptions,
  dateExtent,
  sliceCount,
  totalCount,
}: Props) {
  const togglePitchType = (code: string) => {
    const all = pitchTypeOptions.map((o) => o.code);
    const current = filters.pitchTypes ?? all;
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    // Selecting everything = no filter.
    onChange({ pitchTypes: next.length === all.length ? null : next });
  };

  const checkbox =
    "h-3.5 w-3.5 shrink-0 appearance-none border border-line bg-surface checked:border-accent checked:bg-accent";

  return (
    <div aria-label="Filters">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[10px] tracking-[0.25em] text-ink-3">FILTERS</h2>
        <button
          type="button"
          onClick={onReset}
          className="border border-line px-1.5 py-0.5 text-[10px] text-ink-3 hover:border-accent hover:text-ink"
        >
          RESET
        </button>
      </div>

      <Section title="DATE RANGE">
        {dateExtent && (
          <div className="mb-2 flex flex-wrap gap-px">
            {[
              { label: "FULL", from: null as string | null },
              { label: "L30", from: daysBack(dateExtent.max, dateExtent.min, 30) },
              { label: "L14", from: daysBack(dateExtent.max, dateExtent.min, 14) },
              { label: "L7", from: daysBack(dateExtent.max, dateExtent.min, 7) },
            ].map((p) => {
              const active =
                filters.dateFrom === p.from &&
                (p.from === null ? filters.dateTo === null : true);
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ dateFrom: p.from, dateTo: null })}
                  className={`border px-2 py-1 text-[11px] ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-ink"
                      : "border-line text-ink-3 hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-px">
          <input
            type="date"
            aria-label="From date"
            value={filters.dateFrom ?? ""}
            min={dateExtent?.min}
            max={dateExtent?.max}
            onChange={(e) => onChange({ dateFrom: e.target.value || null })}
            className="border border-line bg-surface px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none"
          />
          <input
            type="date"
            aria-label="To date"
            value={filters.dateTo ?? ""}
            min={dateExtent?.min}
            max={dateExtent?.max}
            onChange={(e) => onChange({ dateTo: e.target.value || null })}
            className="border border-line bg-surface px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none"
          />
        </div>
      </Section>

      <Section title="PITCH TYPE">
        <ul className="space-y-1">
          {pitchTypeOptions.map((o) => {
            const slot = o.code === "OTH" ? slotFor(null) : PITCH_SLOTS[o.code];
            const checked =
              filters.pitchTypes === null ||
              filters.pitchTypes.includes(o.code);
            return (
              <li key={o.code}>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-2 hover:text-ink">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePitchType(o.code)}
                    className={checkbox}
                  />
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5"
                    style={{ background: slot.color }}
                  />
                  <span className="w-8 font-bold">{o.code}</span>
                  <span className="truncate">{o.name}</span>
                  <span className="ml-auto text-ink-3 tabular-nums">
                    {o.count.toLocaleString()}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="COUNT">
        <p className="mb-1 text-[10px] text-ink-3">BALLS</p>
        <SegmentedControl<number | null>
          ariaLabel="Balls"
          value={filters.balls}
          onChange={(v) => onChange({ balls: v })}
          options={[
            { value: null, label: "ANY" },
            ...[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) })),
          ]}
        />
        <p className="mt-2 mb-1 text-[10px] text-ink-3">STRIKES</p>
        <SegmentedControl<number | null>
          ariaLabel="Strikes"
          value={filters.strikes}
          onChange={(v) => onChange({ strikes: v })}
          options={[
            { value: null, label: "ANY" },
            ...[0, 1, 2].map((n) => ({ value: n, label: String(n) })),
          ]}
        />
      </Section>

      <Section title="SITUATION">
        <p className="mb-1 text-[10px] text-ink-3">BATTER SIDE</p>
        <SegmentedControl<"L" | "R" | null>
          ariaLabel="Batter side"
          value={filters.stand}
          onChange={(v) => onChange({ stand: v })}
          options={[
            { value: null, label: "ANY" },
            { value: "L", label: "LHB" },
            { value: "R", label: "RHB" },
          ]}
        />
        <div className="mt-2 space-y-1">
          {(
            [
              ["risp", "RUNNERS ON"],
              ["twoOuts", "2 OUTS"],
              ["lateInnings", "INNING ≥ 7"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-2 hover:text-ink"
            >
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={(e) => onChange({ [key]: e.target.checked })}
                className={checkbox}
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <div className="px-3 py-3 text-[10px] tracking-wider text-ink-3">
        SLICE:{" "}
        <span className="font-bold text-ink tabular-nums">
          {sliceCount.toLocaleString()}
        </span>{" "}
        / {totalCount.toLocaleString()} PITCHES
      </div>
    </div>
  );
}
