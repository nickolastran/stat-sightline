/*
 * Sorting primitives shared by the hand-built stat tables (standings, team
 * stats) — the same semantics DataTable applies to the pitch log, factored
 * out so a table that needs its sort state lifted above several <table>s
 * doesn't have to reimplement them.
 */

export interface Sort {
  key: string;
  dir: "asc" | "desc";
}

/**
 * Clicking a stat sorts it most → least first, since that is what "who leads
 * this column" means for every stat we show; clicking the same one again
 * flips to least → most.
 */
export const toggleSort = (current: Sort | null, key: string): Sort =>
  current?.key === key
    ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
    : { key, dir: "desc" };

/**
 * Rows ordered by one column. Null values sink to the bottom in both
 * directions — a club with no line for a stat is missing, not last-place, so
 * flipping the sort must not float it to the top.
 */
export function sortRows<T>(
  rows: T[],
  dir: "asc" | "desc",
  valueOf: (row: T) => number | string | null
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va < vb ? -sign : va > vb ? sign : 0;
  });
}
