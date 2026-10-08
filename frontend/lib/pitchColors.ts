/*
 * Series colors for pitch types — validated categorical palette (dark mode).
 *
 * Six named slots: the best 6-of-8 subset of the reference dark palette by
 * minimum all-pairs CVD ΔE (10.3, protan/deutan — floor band 8–12). Floor-band
 * separation is legal only with secondary encoding, so every chart that uses
 * these slots also carries per-type marker SHAPES, a legend, hover tooltips,
 * and a table twin. Color follows the pitch type, never its usage rank; types
 * outside the six slots fold into a muted "other" — never a 7th generated hue.
 */

export interface PitchSlot {
  color: string;
  shape: "circle" | "square" | "triangle" | "diamond" | "cross" | "star";
}

export const PITCH_SLOTS: Record<string, PitchSlot> = {
  FF: { color: "#3987e5", shape: "circle" }, // four-seam  — blue
  SL: { color: "#c98500", shape: "square" }, // slider     — yellow
  CH: { color: "#008300", shape: "triangle" }, // changeup — green
  SI: { color: "#e66767", shape: "diamond" }, // sinker    — red
  CU: { color: "#d55181", shape: "cross" }, // curveball   — magenta
  FC: { color: "#d95926", shape: "star" }, // cutter       — orange
};

export const OTHER_SLOT: PitchSlot = { color: "#898781", shape: "circle" };

/* Variants share their family's slot — a sweeper reads as a slider, not as
   "other" — so a staff of sweepers and splitters isn't mostly grey. */
const FAMILY: Record<string, string> = { ST: "SL", SV: "SL", KC: "CU", FS: "CH", FO: "CH" };
for (const [code, family] of Object.entries(FAMILY))
  PITCH_SLOTS[code] = PITCH_SLOTS[family];

export const slotFor = (pitchType: string | null): PitchSlot =>
  (pitchType && PITCH_SLOTS[pitchType]) || OTHER_SLOT;

/*
 * Sequential ramp for the density heatmap — one hue (blue), anchored for the
 * light surface: near-zero recedes toward the surface (lightest step),
 * maximum reads darkest. Steps 100→650 of the reference blue ramp.
 */
export const HEAT_RAMP = [
  "#cde2fb",
  "#9ec5f4",
  "#5598e7",
  "#2a78d6",
  "#1c5cab",
  "#104281",
] as const;

export const heatColor = (value: number, max: number): string | null => {
  if (value <= 0 || max <= 0) return null; // empty cell = bare surface
  const i = Math.min(
    HEAT_RAMP.length - 1,
    Math.floor((value / max) * HEAT_RAMP.length)
  );
  return HEAT_RAMP[i];
};

/*
 * Diverging ramp for the 3×3 hot/cold zone grid — blue (cold) ↔ red (hot),
 * split at roughly league-average BA. The breaks are fixed rather than
 * stretched to the slice's own range, so one pitcher's grid can be read
 * against another's and a filter can't repaint an unchanged cell. Both arms
 * brighten outward off the dark surface; the near-average steps recede
 * toward it, which is the neutral midpoint doing its job.
 */
export const BA_BREAKS = [0.15, 0.21, 0.25, 0.29, 0.35] as const;

export const BA_RAMP = [
  "#5598e7", // < .150 — coldest
  "#2a78d6",
  "#1c5cab",
  "#8f3b39",
  "#c74b48",
  "#e66767", // ≥ .350 — hottest
] as const;

/** null (too few at-bats to average) stays uncolored — bare surface. */
export const baColor = (ba: number | null): string | null =>
  ba === null ? null : BA_RAMP[BA_BREAKS.filter((b) => ba >= b).length];

/*
 * Percentile color, Savant's card: poor blue through a pale average to
 * great red, continuous so 48 and 52 read nearly alike.
 */
const PCT_STOPS = [
  [54, 97, 173], // 0   — poor
  [180, 196, 201], // 50 — average
  [216, 33, 41], // 100 — great
] as const;

export const pctColor = (pct: number): string => {
  const t = Math.min(Math.max(pct, 0), 100) / 50;
  const [a, b] = t <= 1 ? [PCT_STOPS[0], PCT_STOPS[1]] : [PCT_STOPS[1], PCT_STOPS[2]];
  const f = t <= 1 ? t : t - 1;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c.join(", ")})`;
};
