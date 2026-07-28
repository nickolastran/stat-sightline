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
    if (f.risp && !p.runners_on) return false;
    if (f.twoOuts && p.outs_when_up !== 2) return false;
    if (f.lateInnings && (p.inning === null || p.inning < 7)) return false;
    return true;
  });
}
