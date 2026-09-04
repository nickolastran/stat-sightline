import type { TeamStatCol } from "@/lib/mlb";

/*
 * The frame every reference table on the team and player pages sits in —
 * sticky head, its own scrollbar, right-aligned figures. Lifted out of
 * TeamPanels so the player's stats, splits and game log read as the same
 * table rather than each inventing its own chrome.
 */

/** Where a head cell sits: the mask if it names this column, else the default. */
export const headAlign = (align: string | undefined, i: number) =>
  ({ l: "text-left", c: "text-center", r: "text-right" })[align?.[i] ?? ""] ??
  (i === 0 ? "text-left" : "text-right");

export function Table({
  head,
  children,
  maxHeight = "36rem",
  align,
  widths,
  dense = false,
}: {
  /** Column labels; anything after the first is right-aligned. Empty for a
      table that heads its own sections and would only repeat itself. */
  head: string[];
  children: React.ReactNode;
  maxHeight?: string;
  /** One of "l"/"c"/"r" per column, where the default doesn't suit. */
  align?: string;
  /** Fixed column widths — for a section split over several tables, which
      otherwise size their columns to their own longest name and wander. */
  widths?: string[];
  /** Tighter padding and letter-spacing, for a table with enough columns that
      the ordinary chrome would push it off the page — the career line. */
  dense?: boolean;
}) {
  return (
    <div className="overflow-auto border border-line" style={{ maxHeight }}>
      <table
        className={`w-full border-collapse text-xs ${widths ? "table-fixed" : ""}`}
      >
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        {head.length > 0 && (
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={h + i}
                  scope="col"
                  className={`sticky top-0 z-10 border-b border-line bg-surface text-[10px] font-normal text-ink-3 ${
                    dense
                      ? "px-0.5 py-1.5 text-[12px] tracking-wide border-r border-grid last:border-r-0"
                      : "px-3 py-2 tracking-widest"
                  } ${headAlign(align, i)}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Row = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-grid text-ink-2 last:border-b-0 hover:bg-surface-2">
    {children}
  </tr>
);

export function Empty({ what, cols }: { what: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-xs text-ink-3">
        {what}
      </td>
    </tr>
  );
}

/** A labelled band inside a table that repeats the column heads under it —
 *  what lets one table carry several blocks (splits sections, log months). */
export function SectionHead({
  label,
  columns,
}: {
  label: string;
  columns: TeamStatCol[];
}) {
  return (
    <tr className="border-y border-line bg-surface">
      <th
        scope="colgroup"
        className="px-3 py-2 text-left text-[10px] tracking-widest text-ink"
      >
        {label}
      </th>
      {columns.map((c) => (
        <th
          key={c.key}
          scope="col"
          title={c.title}
          className="px-3 py-2 text-right text-[10px] font-normal tracking-widest text-ink"
        >
          {c.label}
        </th>
      ))}
    </tr>
  );
}
