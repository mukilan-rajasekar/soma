import { ImageResponse } from "next/og";

// The social card for /demo — the YC product link. Generated rather than committed as a
// binary so it stays in the design system's palette and can never drift from the page's
// own headline. Palette values are literal here on purpose: ImageResponse renders through
// satori in an isolated context with no access to globals.css custom properties.
//
// Verified against node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-
// and-og-images.md for this Next version: a route-level opengraph-image.tsx default-
// exporting an ImageResponse, with `size` and `contentType` exported alongside.

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
            a brain read-out for ads
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 900, display: "flex" }}>
            Anyone can make a hundred ads. Nobody knows which one wins.
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.4, color: INK2, maxWidth: 820, display: "flex" }}>
            Soma reads how a brain watches each cut — hook, attention, comprehension — then
            builds and edits against that read.
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
