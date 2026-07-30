"use client";

import type { Sort } from "@/lib/sortTable";

/*
 * One clickable column heading for the stat tables. Carries the same ▼/▲
 * affordance and aria-sort contract as DataTable's header, so a sortable
 * column reads identically wherever it appears.
 */
export default function SortHeader({
  label,
  title,
  sortKey,
  sort,
  onSort,
  align = "right",
  className = "",
}: {
  label: string;
  /** Long form of the abbreviation, shown on hover and to assistive tech. */
  title?: string;
  sortKey: string;
  sort: Sort | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={`border-b border-line bg-surface p-0 font-normal ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title ?? label}
        className={`w-full px-2 py-1.5 text-[10px] tracking-widest ${
          align === "right" ? "text-right" : "text-left"
        } ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
      >
        {label}
        <span className="ml-0.5 inline-block w-2">
          {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
        </span>
      </button>
    </th>
  );
}
