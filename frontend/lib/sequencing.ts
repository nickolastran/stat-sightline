import type { Pitch } from "./api";

/*
 * What a pitcher throws next — by the count, and by the pitch he just threw
 * in the same plate appearance. Each row is one situation; its cells are the
 * share of the pitches thrown in it that were each type, so a row reads as
 * the odds on the next pitch.
 */

export interface SeqRow {
  key: string;
  /** Pitches thrown in this situation — the row's sample. */
  n: number;
  /** Share of `n` by pitch type, 0-1. */
  shares: Record<string, number>;
}

/** Every count, in the order a plate appearance can reach it. */
export const COUNTS = [
  "0-0", "1-0", "0-1", "2-0", "1-1", "0-2",
  "3-0", "2-1", "1-2", "3-1", "2-2", "3-2",
];

/** Pitch types outside `codes` fold into "OTH", the way the arsenal does. */
const codeOf = (p: Pitch, codes: readonly string[]) =>
  p.pitch_type && codes.includes(p.pitch_type) ? p.pitch_type : "OTH";

function tally(
  keys: readonly string[],
  pitches: Pitch[],
  codes: readonly string[],
  situation: (p: Pitch) => string | null,
): SeqRow[] {
  const counts = new Map(keys.map((k) => [k, new Map<string, number>()]));
  for (const p of pitches) {
    const row = counts.get(situation(p) ?? "");
    if (!row) continue;
    const c = codeOf(p, codes);
    row.set(c, (row.get(c) ?? 0) + 1);
  }
  return keys.map((key) => {
    const row = counts.get(key)!;
    const n = [...row.values()].reduce((a, b) => a + b, 0);
    return {
      key,
      n,
      shares: Object.fromEntries([...row].map(([c, k]) => [c, k / n])),
    };
  });
}

/** What he throws in each count. */
export const byCount = (pitches: Pitch[], codes: readonly string[]) =>
  tally(COUNTS, pitches, codes, (p) =>
    p.balls === null || p.strikes === null ? null : `${p.balls}-${p.strikes}`,
  );

/** What he throws right after each pitch type, within one plate appearance. */
export function afterPitch(pitches: Pitch[], codes: readonly string[]) {
  const at = (p: Pitch, n: number) => `${p.game_pk}|${p.at_bat_number}|${n}`;
  const thrown = new Map(
    pitches
      .filter((p) => p.pitch_number != null)
      .map((p) => [at(p, p.pitch_number!), codeOf(p, codes)]),
  );
  return tally(codes, pitches, codes, (p) =>
    p.pitch_number ? (thrown.get(at(p, p.pitch_number - 1)) ?? null) : null,
  );
}
