"use client";

import { useMemo, useState } from "react";

/*
 * Generic sortable table with a sticky header. Large datasets are handled
 * by windowed reveal: `pageSize` rows render initially and SHOW MORE
 * extends in chunks, so a 10k-row pitch log never mounts 10k rows at once.
 * `paginate` swaps that for pages — the same `pageSize`, read a page at a
 * time, for a board somebody works through rather than scrolls down.
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
  /** A fixed column width ("8rem"). One column declaring one switches the
   *  whole table to a fixed layout, so the grid lands identically whatever
   *  the rows hold — a board read across seasons doesn't shift its columns
   *  when one season leaves half of them empty. */
  width?: string;
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
  /** Pages rather than a growing window: `pageSize` rows at a time, with a
   *  pager under the table. For a board read a page at a time (a draft) —
   *  the reveal is for a log read straight down. */
  paginate?: boolean;
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
  paginate = false,
  maxHeight = "28rem",
  emptyLabel = "0 ROWS IN SLICE",
  showCount = true,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [visible, setVisible] = useState(pageSize);
  const [page, setPage] = useState(1);

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

  /* Clamped rather than reset: filtering 600 rows down to 20 while page 5 is
     open lands on the last page there is, without an effect to watch for it. */
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const shown = paginate
    ? sorted.slice((current - 1) * pageSize, current * pageSize)
    : sorted.slice(0, visible);

  const toggleSort = (key: string) => {
    /* A new order is a new first page — not row 251 of a different sort. */
    setPage(1);
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  };

  /* Any width given is a table laid out from the widths rather than from the
     content; the sum scrolls sideways where it doesn't fit. */
  const fixed = columns.some((c) => c.width);
  /* Author-set widths are packed ones — the cells give their padding back to
     the content rather than to the gap between columns. */
  const pad = fixed ? "px-2" : "px-3";

  /* "none" hands the vertical scroll back to the page — a long roster reads
     straight down instead of inside a box with its own scrollbar. */
  const boxed = maxHeight !== "none";

  return (
    <div>
      <div
        className={`border border-line ${boxed ? "overflow-auto" : "overflow-x-auto"}`}
        style={boxed ? { maxHeight } : undefined}
      >
        <table
          className={`border-collapse text-xs ${
            fixed ? "w-max min-w-full table-fixed" : "w-full"
          }`}
        >
          {fixed && (
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
          )}
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
                        className={`w-full ${pad} py-2 text-[10px] tracking-widest ${
                          ALIGN[c.align ?? "left"]
                        } ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                      >
                        {/* Marker hangs in the padding — see SortHeader. */}
                        <span className="relative inline-block -mr-[0.1em]">
                          {c.label}
                          <span className="absolute left-full top-1/2 w-2.5 -translate-y-1/2 text-center text-[11px] leading-none">
                            {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span
                        className={`block ${pad} py-2 text-[10px] tracking-widest text-ink-3`}
                      >
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
                    className={`${pad} py-1.5 whitespace-nowrap text-ink-2 ${
                      ALIGN[c.align ?? "left"]
                    } ${c.align === "left" || !c.align ? "" : "tabular-nums"} ${
                      /* A fixed column keeps its width: what doesn't fit is
                         clipped rather than pushing the next column over. */
                      fixed ? "overflow-hidden text-ellipsis" : ""
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
      {paginate ? (
        <div className="flex items-center justify-between gap-2 border-x border-b border-line px-3 py-1.5 text-[10px] tracking-wider text-ink-3">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 1}
            className="border border-line px-3 py-1 text-ink-2 hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
          >
            ← PREVIOUS
          </button>
          <label className="flex items-center gap-1.5">
            PAGE
            <input
              type="number"
              min={1}
              max={pages}
              value={current}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPage(Math.min(Math.max(n, 1), pages));
              }}
              className="w-12 border border-line bg-bg px-1 py-0.5 text-center text-[10px] tabular-nums text-ink hover:border-accent focus:border-accent focus:outline-none"
            />
            OF {pages}
          </label>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current === pages}
            className="border border-line px-3 py-1 text-ink-2 hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
          >
            NEXT →
          </button>
        </div>
      ) : (
        /* Nothing to say once the count is off and every row is on screen —
           then the bar itself goes rather than sitting empty under the table. */
        (showCount || visible < sorted.length) && (
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
        )
      )}
    </div>
  );
}
