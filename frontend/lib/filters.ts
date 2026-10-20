import type { Pitch } from "./api";

/*
 * One FilterState scopes the entire dashboard main area — every metric card,
 * plot, and table renders from the same filtered slice, so the numbers always
 * agree. Filtering is client-side over the fetched payload: filter changes
 * are instant, no refetch.
 */

export interface FilterState {
  dateFrom: string | null; // ISO date, inclusive
  dateTo: string | null;
  pitchTypes: string[] | null; // null = all; codes, "OTH" = outside named slots
  balls: number | null; // null = any
  strikes: number | null;
  stand: "L" | "R" | null; // batter side
  pThrows: "L" | "R" | null; // pitcher hand
  risp: boolean; // runners on base
  twoOuts: boolean;
  lateInnings: boolean; // 7th or later
}

export const DEFAULT_FILTERS: FilterState = {
  dateFrom: null,
  dateTo: null,
  pitchTypes: null,
  balls: null,
  strikes: null,
  stand: null,
  pThrows: null,
  risp: false,
  twoOuts: false,
  lateInnings: false,
};

export function applyFilters(
  pitches: Pitch[],
  f: FilterState,
  namedTypes: ReadonlySet<string>
): Pitch[] {
  return pitches.filter((p) => {
    if (f.dateFrom && (!p.game_date || p.game_date < f.dateFrom)) return false;
    if (f.dateTo && (!p.game_date || p.game_date > f.dateTo)) return false;
    if (f.pitchTypes) {
      const code =
        p.pitch_type && namedTypes.has(p.pitch_type) ? p.pitch_type : "OTH";
      if (!f.pitchTypes.includes(code)) return false;
    }
    if (f.balls !== null && p.balls !== f.balls) return false;
    if (f.strikes !== null && p.strikes !== f.strikes) return false;
    if (f.stand && p.stand !== f.stand) return false;
    if (f.pThrows && p.p_throws !== f.pThrows) return false;
    if (f.risp && !p.runners_on) return false;
    if (f.twoOuts && p.outs_when_up !== 2) return false;
    if (f.lateInnings && (p.inning === null || p.inning < 7)) return false;
    return true;
  });
}

/*
 * The filters as URL parameters, so a slice is a link that survives a
 * refresh. Only what differs from the default is written, and everything
 * read back is checked — the URL is whatever someone pasted.
 *
 *   from, to  ISO dates          pt     pitch codes, comma-separated
 *   b, s      balls, strikes     bat    batter side L/R   arm  pitcher hand L/R
 *   risp, outs2, late            flags, "1" when on
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z]{2,3}$/;

const side = (v: string | null): "L" | "R" | null =>
  v === "L" || v === "R" ? v : null;
const count = (v: string | null, max: number): number | null => {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

export function filtersToQuery(f: FilterState): URLSearchParams {
  const q = new URLSearchParams();
  if (f.dateFrom) q.set("from", f.dateFrom);
  if (f.dateTo) q.set("to", f.dateTo);
  if (f.pitchTypes) q.set("pt", f.pitchTypes.join(","));
  if (f.balls !== null) q.set("b", String(f.balls));
  if (f.strikes !== null) q.set("s", String(f.strikes));
  if (f.stand) q.set("bat", f.stand);
  if (f.pThrows) q.set("arm", f.pThrows);
  if (f.risp) q.set("risp", "1");
  if (f.twoOuts) q.set("outs2", "1");
  if (f.lateInnings) q.set("late", "1");
  return q;
}

export function filtersFromQuery(q: URLSearchParams): FilterState {
  const date = (k: string) => {
    const v = q.get(k);
    return v && DATE.test(v) ? v : null;
  };
  const pt = q.get("pt");
  return {
    dateFrom: date("from"),
    dateTo: date("to"),
    /* An empty list is a real slice (every type unchecked); junk is dropped. */
    pitchTypes: pt === null ? null : pt.split(",").filter((c) => CODE.test(c)),
    balls: count(q.get("b"), 3),
    strikes: count(q.get("s"), 2),
    stand: side(q.get("bat")),
    pThrows: side(q.get("arm")),
    risp: q.get("risp") === "1",
    twoOuts: q.get("outs2") === "1",
    lateInnings: q.get("late") === "1",
  };
}
