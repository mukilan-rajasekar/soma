"use client";

// The science figure: a lateral cortex with TWO distinct networks marked, because the
// spec's differentiator is that the signal is regional, not "attention as a whole".
//   DORSAL attention network (IPS / FEF / superior parietal) — where focus is steered.
//   VENTRAL attention / salience network (anterior insula + ACC) — fires on the
//   unexpected; the surprise/shock read that scores the hook.
// Each region lights independently. Colours match the arc lanes on purpose — dorsal is
// ink (the solid attention curve), ventral is slate (the dashed surprise curve) — so the
// brain and the charts read as one instrument. `focus` lets a section spotlight one
// region (the hook section leans ventral).
//
// The figure builds itself in stages rather than appearing: outline, folds, brainstem, then
// each region lighting and captioning in turn. That order is the section's argument, not
// decoration — the heading claims attention is not one thing and that different regions do
// different jobs, and watching the two light separately is what makes the claim legible. It
// also gave the first beat something to animate: §01 was previously the one section on the
// page where nothing moved except the heading fading in.
//
// Drive it with `animate={revealed}` for the staged build, or pin `t` (0..1) to control the
// highlight yourself. Reduced motion resolves the clock to 1 on the first frame, so the
// finished figure renders with no intermediate state.

import { useAnimeClock } from "./useReveal";

type Props = {
  t?: number; // 0..1 progress, when the caller wants to own it
  animate?: boolean | null; // reveal gate for the internal staged clock
  buildMs?: number;
  focus?: "both" | "dorsal" | "ventral";
  labels?: boolean;
  height?: number;
};

const INK = "#0a0a0a";
const ACCENT2 = "#5f8b99";
const INK3 = "#727272";

// The cortex art is authored in its own 360×300 space and then placed inside a taller
// 380×340 frame by BRAIN_PLACE, which reserves a gutter above it and a gutter below-left
// purely for the two callout labels.
//
// They used to be drawn straight into the art's own box, which had no room for them: the
// cortex path spans x 24→322 of 360 and y 32→258 of 300, so "VENTRAL · SURPRISE" and
// "fires on the unexpected" were rendered directly over the lower-left outline and the
// brainstem, and the dorsal callout's leader line was a 32px stub with nowhere to go.
// Reserving the space in the frame is the fix; nudging the text was never going to be one,
// because there was no empty pixel to nudge it to.
const BRAIN_PLACE = "translate(14 46) scale(0.88)";
// Art-space → frame-space, for the label anchors and leaders. They live outside the
// transformed group so the type stays at its authored size instead of being scaled by 0.88.
const fx = (x: number) => 14 + 0.88 * x;
const fy = (y: number) => 46 + 0.88 * y;

const CORTEX =
  "M40,168 C24,120 44,74 92,52 C130,34 186,32 232,44 C288,58 322,96 320,140 C319,168 302,186 276,196 C270,214 250,226 224,226 C210,238 188,242 168,236 C150,244 126,242 110,230 C86,232 64,222 56,202 C44,196 38,184 40,168 Z";

const SULCI = [
  "M70,92 C120,78 190,78 250,92 C286,101 306,110 318,120",
  "M60,124 C120,116 200,120 268,132 C294,137 308,140 320,140",
  "M74,158 C130,154 200,158 262,166",
  "M92,192 C140,190 196,192 240,190",
  "M150,60 C146,110 150,170 158,224",
  "M206,52 C202,108 206,168 214,214",
];

// The build order, as fractions of the whole clock. Overlapping windows on purpose: a strict
// relay reads as a slideshow, an overlap reads as one continuous gesture.
const STAGE = {
  outline: [0, 0.3],
  sulci: [0.16, 0.52],
  stem: [0.3, 0.44],
  dorsal: [0.42, 0.7],
  dorsalLabel: [0.6, 0.82],
  ventral: [0.6, 0.86],
  ventralLabel: [0.78, 1],
} as const;

// Every path here is authored with pathLength="1", so one normalised dashoffset draws it
// regardless of its real arc length — no measuring paths in JS, no layout read.
const draw = (p: number) => ({ strokeDasharray: 1, strokeDashoffset: 1 - p });

export default function TwoRegionBrain({
  t,
  animate = null,
  buildMs = 2100,
  focus = "both",
  labels = true,
  height = 300,
}: Props) {
  const clock = useAnimeClock(animate === true, buildMs, "linear");
  // `t` wins when supplied; otherwise the internal clock runs. Both collapse to 1 when the
  // caller wants the finished figure and to 0 before the section is reached.
  const p = t ?? (animate == null ? 1 : clock);
  const at = (s: readonly [number, number]) =>
    Math.max(0, Math.min(1, (p - s[0]) / (s[1] - s[0])));

  const dOn = focus === "both" || focus === "dorsal";
  const vOn = focus === "both" || focus === "ventral";
  const dEmph = focus === "dorsal";
  const vEmph = focus === "ventral";

  const outline = at(STAGE.outline);
  const sulci = at(STAGE.sulci);
  const stem = at(STAGE.stem);
  // Stage progress is independent of `focus`: a region that is dimmed still has to arrive at
  // its dim value rather than sitting there from the first frame. `focus` picks the TARGET,
  // the stage decides how much of it has arrived. Getting this the other way round (baking a
  // 0.14 floor into the value and ramping only the remainder) left both regions faintly
  // visible under an outline that had not finished drawing, which gave away that the build
  // was a fade rather than a sequence.
  const dP = at(STAGE.dorsal);
  const vP = at(STAGE.ventral);
  const dL = at(STAGE.dorsalLabel);
  const vL = at(STAGE.ventralLabel);

  const dLit = (dOn ? 0.8 : 0.06) * dP;
  const vLit = (vOn ? 0.86 : 0.06) * vP;

  return (
    <svg
      viewBox="0 0 380 340"
      role="img"
      aria-label="Lateral cortex with the dorsal attention network and the ventral salience network marked"
      className="block w-full"
      style={{ maxHeight: height }}
    >
      <defs>
        <radialGradient id="dorsalG" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor={INK} stopOpacity="0.9" />
          <stop offset="1" stopColor={INK} stopOpacity="0.15" />
        </radialGradient>
        <radialGradient id="ventralG" cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={ACCENT2} stopOpacity="0.95" />
          <stop offset="1" stopColor={ACCENT2} stopOpacity="0.2" />
        </radialGradient>
        <clipPath id="cortexClip">
          <path d={CORTEX} />
        </clipPath>
      </defs>

      <g transform={BRAIN_PLACE}>
        {/* cortex body: fill fades, edge draws */}
        <path d={CORTEX} fill="#fafafa" fillOpacity={outline} stroke="none" />
        <path
          d={CORTEX}
          pathLength="1"
          fill="none"
          stroke={INK}
          strokeOpacity="0.5"
          strokeWidth="1.4"
          {...draw(outline)}
        />

        {/* sulci — decorative folds, clipped to the cortex, drawn in a staggered sweep so
            the folds appear to be filled in after the outline closes */}
        <g clipPath="url(#cortexClip)" stroke={INK3} strokeOpacity="0.28" strokeWidth="1" fill="none">
          {SULCI.map((d, i) => {
            const lead = i * 0.11; // last fold leads at 0.55, so every window has real width
            const local = Math.max(0, Math.min(1, (sulci - lead) / (1 - lead)));
            return <path key={d} d={d} pathLength="1" {...draw(local)} />;
          })}
        </g>

        {/* brainstem hint */}
        <path
          d="M150,232 C156,250 172,258 190,256"
          pathLength="1"
          fill="none"
          stroke={INK}
          strokeOpacity="0.35"
          strokeWidth="6"
          strokeLinecap="round"
          {...draw(stem)}
        />

        {/* --- DORSAL attention network: superior-posterior (IPS/SPL) --- */}
        <g clipPath="url(#cortexClip)">
          <ellipse cx="238" cy="96" rx="52" ry="34" fill="url(#dorsalG)" opacity={dLit} transform="rotate(-12 238 96)" />
        </g>
        {/* The boundary can't use the dashoffset trick: pathLength on <ellipse> is SVG 2 and
            not dependable across engines, and a dashed boundary needs its dasharray for the
            dashes. Scaling the ring up from 0.86 as it fades reads as the region coming to
            life rather than switching on, and works everywhere.
            The scale goes in the transform ATTRIBUTE, not a CSS transform: they are the same
            property, CSS wins, and a `style` transform here would silently drop the rotate
            that tilts the ring along the parietal axis. */}
        <ellipse
          cx="238" cy="96" rx="52" ry="34"
          transform={`rotate(-12 238 96) translate(238 96) scale(${0.86 + dP * 0.14}) translate(-238 -96)`}
          fill="none" stroke={INK} strokeWidth={dEmph ? 2 : 1.2}
          strokeOpacity={(dOn ? 0.9 : 0.2) * dP}
          strokeDasharray={dEmph ? "" : "4 4"}
        />

        {/* --- VENTRAL salience network: anterior insula + inferior frontal --- */}
        <g clipPath="url(#cortexClip)">
          <ellipse cx="108" cy="168" rx="42" ry="30" fill="url(#ventralG)" opacity={vLit} transform="rotate(8 108 168)" />
        </g>
        <ellipse
          cx="108" cy="168" rx="42" ry="30"
          transform={`rotate(8 108 168) translate(108 168) scale(${0.86 + vP * 0.14}) translate(-108 -168)`}
          fill="none" stroke={ACCENT2} strokeWidth={vEmph ? 2.2 : 1.2}
          strokeOpacity={(vOn ? 1 : 0.25) * vP}
          strokeDasharray={vEmph ? "" : "4 4"}
        />
      </g>

      {/* Both callouts follow one system: a vertical leader from the region it names out to
          a two-line label in a reserved gutter, title over descriptor. The leader crosses
          the cortex outline on its way out, which is what a callout is supposed to do; the
          type never does, which is what it was doing before.
          Each leader extends from the label toward the region — the direction a reader's eye
          travels — and the type only appears once its leader has arrived. */}
      {labels && (
        <g fontFamily="system-ui, sans-serif">
          {/* dorsal — top gutter, leader down into the region's upper edge */}
          <line
            x1={fx(238)} y1="72" x2={fx(238)} y2={72 + 29 * dL}
            stroke={INK} strokeOpacity={(dOn ? 0.4 : 0.15) * dL} strokeWidth="1"
          />
          <text x={fx(238)} y="50" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK} opacity={(dOn ? 1 : 0.3) * dL}>
            DORSAL · ATTENTION
          </text>
          <text x={fx(238)} y="64" textAnchor="middle" fontSize="9" fill={INK3} opacity={(dOn ? 0.9 : 0.25) * dL}>
            where focus is steered
          </text>

          {/* ventral — bottom-left gutter, leader up out of the region's lower edge */}
          <line
            x1="76" y1="296" x2={76 + 4 * vL} y2={296 - (296 - fy(190)) * vL}
            stroke={ACCENT2} strokeOpacity={(vOn ? 0.5 : 0.2) * vL} strokeWidth="1"
          />
          <text x="76" y="311" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={ACCENT2} opacity={(vOn ? 1 : 0.3) * vL}>
            VENTRAL · SURPRISE
          </text>
          <text x="76" y="325" textAnchor="middle" fontSize="9" fill={INK3} opacity={(vOn ? 0.9 : 0.25) * vL}>
            fires on the unexpected
          </text>
        </g>
      )}
    </svg>
  );
}
