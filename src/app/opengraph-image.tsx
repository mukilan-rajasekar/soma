import { ImageResponse } from "next/og";

// The root social card — what a bare usesoma.work link unfurls as. Same construction as
// src/app/demo/opengraph-image.tsx: generated rather than committed as a binary so it
// stays in the palette and carries the landing page's own headline. Palette values are
// literal on purpose — ImageResponse renders through satori in an isolated context with
// no access to globals.css custom properties.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0a0a0a";
const INK2 = "#4a4a4a";
const INK3 = "#727272";
const PAPER = "#ffffff";
const LINE = "#e2e2e2";
const ACCENT = "#3f6f7a";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PAPER,
          color: INK,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 600 }}>soma</div>
          <div style={{ width: 1, height: 22, background: LINE }} />
          <div style={{ fontSize: 20, color: INK3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            neural ad pre-testing
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 900, display: "flex" }}>
            Find the ad that wins attention.
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.4, color: INK2, maxWidth: 820, display: "flex" }}>
            Soma uses real fMRI data to read how your ad earns attention, so you launch
            the one that wins.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 20, color: INK3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 3, background: INK }} />
            <span>Attention · dorsal</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 3, background: ACCENT }} />
            <span>Surprise · ventral</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
