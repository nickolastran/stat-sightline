/* The stat cell every table here is built from: its value, its column, and reading it as a number. */


/* ── Team statistics ────────────────────────────────────────────────── */

/** A single team stat cell. Strings arrive pre-formatted (".265", "3.47"). */
export type TeamStatValue = number | string | null;

export interface TeamStatCol {
  /** statsapi key inside the split's `stat` object. */
  key: string;
  label: string;
  /** Long form of the abbreviation — the column tooltip and the glossary entry. */
  title: string;
}

/**
 * Sort key for a stat cell. Rate strings (".265", "3.47") parse cleanly;
 * anything unparseable is null so the table can sink it to the bottom in
 * both directions rather than sorting it as zero.
 */
export const teamStatNum = (v: TeamStatValue): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Rotation or bullpen, read off the season line — MLB files every arm under
 * position "P", so this is the only thing that says which job a pitcher has.
 * Half his appearances as a start puts him in the rotation; nobody with no
 * line yet has started a game, which leaves him in the bullpen, where a fresh
 * arm in fact is.
 */
export const inRotation = (gs: number, g: number) => gs > 0 && gs * 2 >= g;

/**
 * WAR, wherever a table that isn't the career one shows it. MLB publishes no
 * WAR of its own — the figure is a third-party derivation — so this is the
 * FanGraphs number its sabermetrics feed carries, the same one the career
 * table prints.
 */
export const WAR_COL: TeamStatCol = {
  key: "war",
  label: "WAR",
  title: "Wins above replacement (FanGraphs, via MLB)",
};

/** "2ND", "3RD", "11TH" — the rank line under a stat tile. */
export function ordinal(n: number): string {
  const tail = ["TH", "ST", "ND", "RD"];
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "TH" : (tail[n % 10] ?? "TH")}`;
}
