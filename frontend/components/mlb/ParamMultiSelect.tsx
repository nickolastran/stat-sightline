"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSetParam } from "@/lib/useSetParam";

/*
 * A labelled control that opens a pop-out of checkboxes and writes what is
 * ticked into one query parameter, pipe-joined — the multi-value counterpart
 * of ParamSelect, and the shape Savant's own org / zone / pitch-type filters
 * take. Like every other control on these pages the choice lives in the URL,
 * because the board it filters is fetched on the server.
 *
 * Ticking a box commits immediately rather than behind an APPLY button: the
 * bar sits outside the section's Suspense boundary, so the pop-out stays open
 * and keeps its place while the table behind it re-fetches.
 */

export interface MultiOption {
  value: string;
  label: string;
  /** A swatch before the label — the pitch types carry their series color. */
  color?: string;
}

export interface MultiGroup {
  /** Blank for a group that is only there to lay one option out. */
  label?: string;
  options: MultiOption[];
}

export default function ParamMultiSelect({
  param,
  label,
  value,
  groups,
  quick = [],
  cols = 1,
  width = "w-56",
  image,
}: {
  param: string;
  label: string;
  value: string[];
  groups: MultiGroup[];
  /** One-click sets — "American League", "Top" — beside the CLEAR link. */
  quick?: { label: string; values: string[] }[];
  /** Columns the groups are dealt into, filled top to bottom. */
  cols?: number;
  width?: string;
  /** A diagram under the boxes, for the zone picker. */
  image?: string;
}) {
  const setParam = useSetParam();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* A pop-out that outlives a click elsewhere on the page is a pop-out that
     covers the table it filters. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const all = groups.flatMap((g) => g.options);
  const picked = new Set(value);

  /* Written back in the order the pop-out lists them, not the order they were
     ticked, so the same selection is always the same link. */
  const commit = (next: Set<string>) => {
    const joined = all
      .filter((o) => next.has(o.value))
      .map((o) => o.value)
      .join("|");
    /* Nothing ticked drops the parameter rather than setting it empty — an
       unfiltered board should have an unfiltered link. */
    startTransition(() => setParam({ [param]: joined || null }));
  };

  const toggle = (values: string[], on: boolean) => {
    const next = new Set(picked);
    for (const v of values) {
      if (on) next.add(v);
      else next.delete(v);
    }
    commit(next);
  };

  const summary =
    value.length === 0
      ? "—"
      : value.length === 1
        ? (all.find((o) => o.value === value[0])?.label ?? "1")
        : `${value.length} PICKED`;

  const rows = Math.ceil(groups.length / cols);

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
        {label}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex min-w-24 items-center justify-between gap-2 border px-1.5 py-0.5 text-[10px] tracking-normal hover:border-accent ${
            value.length ? "border-accent text-ink" : "border-line text-ink"
          } ${pending ? "opacity-50" : ""}`}
        >
          <span className="truncate">{summary}</span>
          <span aria-hidden className="text-[8px] text-ink-3">
            ▼
          </span>
        </button>
      </div>

      {open && (
        <div
          className={`absolute right-0 z-40 mt-1 ${width} max-h-[26rem] space-y-2 overflow-y-auto border border-line bg-surface p-2 shadow-lg`}
        >
          <div
            className="grid gap-x-3 gap-y-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, auto)`,
              gridAutoFlow: "column",
            }}
          >
            {groups.map((g, i) => {
              const values = g.options.map((o) => o.value);
              const allOn = values.every((v) => picked.has(v));
              return (
                <div key={g.label || i} className="space-y-0.5">
                  {g.label && (
                    <Box
                      label={g.label}
                      checked={allOn}
                      onChange={(on) => toggle(values, on)}
                      className="text-ink-3"
                    />
                  )}
                  <div className={g.label ? "space-y-0.5 pl-3" : "space-y-0.5"}>
                    {g.options.map((o) => (
                      <Box
                        key={o.value}
                        label={o.label}
                        color={o.color}
                        checked={picked.has(o.value)}
                        onChange={(on) => toggle([o.value], on)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="" className="w-full border border-grid" />
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-grid pt-1.5 text-[10px] text-ink-3">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => toggle(q.values, true)}
                className="tracking-wider text-accent hover:underline"
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => commit(new Set())}
              className="ml-auto tracking-wider text-accent hover:underline"
            >
              CLEAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Box({
  label,
  checked,
  onChange,
  color,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  color?: string;
  className?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 text-[10px] tracking-wider text-ink-2 hover:text-ink ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 shrink-0 accent-accent"
      />
      {color && (
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{label}</span>
    </label>
  );
}
