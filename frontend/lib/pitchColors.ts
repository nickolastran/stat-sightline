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

export const slotFor = (pitchType: string | null): PitchSlot =>
  (pitchType && PITCH_SLOTS[pitchType]) || OTHER_SLOT;

/*
 * Sequential ramp for the density heatmap — one hue (blue), anchored for the
 * dark surface: near-zero recedes toward the surface (darkest step), maximum
 * reads brightest. Steps 650→100 of the reference blue ramp.
 */
export const HEAT_RAMP = [
  "#104281",
  "#1c5cab",
  "#2a78d6",
  "#5598e7",
  "#9ec5f4",
  "#cde2fb",
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
