"use client";

import { useMemo, useState } from "react";

/*
 * Generic sortable table with a sticky header. Large datasets are handled
 * by windowed reveal: `pageSize` rows render initially and SHOW MORE
 * extends in chunks, so a 10k-row pitch log never mounts 10k rows at once.
 * Numeric columns right-align with tabular figures so digits line up.
 */

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
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
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSort,
  pageSize = 50,
  maxHeight = "28rem",
  emptyLabel = "0 ROWS IN SLICE",
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

  return (
    <div>
      <div className="overflow-auto border border-line" style={{ maxHeight }}>
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
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`w-full px-3 py-2 text-[10px] tracking-widest ${
                          c.align === "right" ? "text-right" : "text-left"
                        } ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                      >
                        {c.label}
                        <span className="ml-1 inline-block w-2">
                          {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
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
                    className={`px-3 py-1.5 whitespace-nowrap ${
                      c.align === "right"
                        ? "text-right tabular-nums text-ink-2"
                        : "text-left text-ink-2"
                    }`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-x border-b border-line px-3 py-1.5 text-[10px] tracking-wider text-ink-3">
        <span>
          {Math.min(visible, sorted.length).toLocaleString()} /{" "}
          {sorted.length.toLocaleString()} ROWS
        </span>
        {visible < sorted.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + pageSize)}
            className="border border-line px-2 py-0.5 text-ink-2 hover:border-accent hover:text-ink"
          >
            SHOW MORE +{Math.min(pageSize, sorted.length - visible)}
          </button>
        )}
      </div>
    </div>
  );
}
