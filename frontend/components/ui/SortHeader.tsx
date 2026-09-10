"use client";

import type { Sort } from "@/lib/sortTable";

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

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
  /** Must match the alignment of the cells below, or the label drifts off them. */
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={`border-b border-line bg-surface p-0 font-normal ${ALIGN[align]} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title ?? label}
        className={`w-full px-2.5 py-1.5 text-[10px] tracking-widest ${
          ALIGN[align]
        } ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}
      >
        {/*
         * The sort marker hangs in the cell padding rather than taking width in
         * the flow, so the label lands on the numbers below it instead of
         * sitting a marker-width to their left — and doesn't shift on sort.
         * It has to *fit* that padding, though: given any gap of its own it
         * spills past the cell edge and reads as the next column's marker.
         * The negative margin cancels the trailing letter-space `tracking`
         * adds after the last character, which the numbers don't carry.
         */}
        <span className="relative inline-block -mr-[0.1em]">
          {label}
          <span className="absolute left-full top-1/2 w-2.5 -translate-y-1/2 text-center text-[11px] leading-none">
            {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
          </span>
        </span>
      </button>
    </th>
  );
}
