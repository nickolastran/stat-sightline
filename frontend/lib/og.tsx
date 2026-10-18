import { ImageResponse } from "next/og";

/*
 * The link-preview card every shareable page draws on: paper, ink, the mark
 * top left and what kind of page it is top right. Each route fills the body.
 * Satori's default face (Geist) stands in for Helvetica, which it can't load.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const INK = "#16150f";
export const INK_3 = "#78756b";
const ACCENT = "#2668c9";

export function ogCard(kicker: string, body?: React.ReactNode) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "#f4f2ec",
          color: INK,
          borderTop: `12px solid ${ACCENT}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            letterSpacing: 6,
            color: INK_3,
          }}
        >
          <div style={{ display: "flex", color: INK }}>
            STAT<span style={{ color: ACCENT }}>//</span>SIGHTLINE
          </div>
          <div>{kicker}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          {body}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
