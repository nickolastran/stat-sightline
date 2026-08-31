"use client";

import { useMemo, useState } from "react";

/*
 * Generic sortable table with a sticky header. Large datasets are handled
 * by windowed reveal: `pageSize` rows render initially and SHOW MORE
 * extends in chunks, so a 10k-row pitch log never mounts 10k rows at once.
 * Numeric columns right-align with tabular figures so digits line up.
 */

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export interface Column<T> {
  key: string;
  label: string;
  align?: keyof typeof ALIGN;
  sortValue?: (row: T) => number | string | null;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  maxHeight?: string;
  emptyLabel?: string;
  /** The "n / total ROWS" line — off where the panel already says the count. */
  showCount?: boolean;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSort,
  pageSize = 50,
  maxHeight = "28rem",
  emptyLabel = "0 ROWS IN SLICE",
  showCount = true,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [visible, setVisible] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls last regardless of direction
      if (vb === null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [rows, sort, columns]);

  const shown = sorted.slice(0, visible);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );

  /* "none" hands the vertical scroll back to the page — a long roster reads
     straight down instead of inside a box with its own scrollbar. */
  const boxed = maxHeight !== "none";

  return (
    <div>
      <div
        className={`border border-line ${boxed ? "overflow-auto" : "overflow-x-auto"}`}
        style={boxed ? { maxHeight } : undefined}
      >
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`sticky top-0 z-10 border-b border-line bg-surface p-0 ${
                      ALIGN[c.align ?? "left"]
                    }`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`w-full px-3 py-2 text-[10px] tracking-widest ${
                          ALIGN[c.align ?? "left"]
                        } ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                      >
                        {/* Marker hangs in the padding — see SortHeader. */}
                        <span className="relative inline-block -mr-[0.1em]">
                          {c.label}
                          <span className="absolute left-full top-1/2 ml-1 w-2.5 -translate-y-1/2 text-center text-[11px] leading-none">
                            {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span className="block px-3 py-2 text-[10px] tracking-widest text-ink-3">
                        {c.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-ink-3"
                >
                  {emptyLabel}
                </td>
              </tr>
            )}
            {shown.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 whitespace-nowrap text-ink-2 ${
                      ALIGN[c.align ?? "left"]
                    } ${c.align === "left" || !c.align ? "" : "tabular-nums"}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Nothing to say once the count is off and every row is on screen —
          then the bar itself goes rather than sitting empty under the table. */}
      {(showCount || visible < sorted.length) && (
        <div className="flex items-center justify-between gap-2 border-x border-b border-line px-3 py-1.5 text-[10px] tracking-wider text-ink-3">
          {showCount && (
            <span>
              {Math.min(visible, sorted.length).toLocaleString()} /{" "}
              {sorted.length.toLocaleString()} ROWS
            </span>
          )}
          {visible < sorted.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + pageSize)}
              className="ml-auto border border-line px-2 py-0.5 text-ink-2 hover:border-accent hover:text-ink"
            >
              SHOW MORE +{Math.min(pageSize, sorted.length - visible)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
