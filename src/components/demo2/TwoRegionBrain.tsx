"use client";

// The science figure: a lateral cortex with TWO distinct networks marked, because the
// spec's differentiator is that the signal is regional, not "attention as a whole".
//   DORSAL attention network (IPS / FEF / superior parietal) — where focus is steered.
//   VENTRAL attention / salience network (anterior insula + ACC) — fires on the
//   unexpected; the surprise/shock read that scores the hook.
// Each region lights independently. Colours match the arc lanes on purpose — dorsal is
// ink (the solid attention curve), ventral is slate (the dashed surprise curve) — so the
// brain and the charts read as one instrument. `focus` lets a section spotlight one
// region (the hook section leans ventral); `t` (0..1) eases the highlight in on reveal.

type Props = {
  t?: number; // 0..1 reveal progress
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

export default function TwoRegionBrain({ t = 1, focus = "both", labels = true, height = 300 }: Props) {
  const dOn = focus === "both" || focus === "dorsal";
  const vOn = focus === "both" || focus === "ventral";
  const dLit = dOn ? 0.14 + t * 0.66 : 0.06;
  const vLit = vOn ? 0.14 + t * 0.72 : 0.06;
  const dEmph = focus === "dorsal";
  const vEmph = focus === "ventral";

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
          <path d="M40,168 C24,120 44,74 92,52 C130,34 186,32 232,44 C288,58 322,96 320,140 C319,168 302,186 276,196 C270,214 250,226 224,226 C210,238 188,242 168,236 C150,244 126,242 110,230 C86,232 64,222 56,202 C44,196 38,184 40,168 Z" />
        </clipPath>
      </defs>

      <g transform={BRAIN_PLACE}>
        {/* cortex body */}
        <path
          d="M40,168 C24,120 44,74 92,52 C130,34 186,32 232,44 C288,58 322,96 320,140 C319,168 302,186 276,196 C270,214 250,226 224,226 C210,238 188,242 168,236 C150,244 126,242 110,230 C86,232 64,222 56,202 C44,196 38,184 40,168 Z"
          fill="#fafafa"
          stroke={INK}
          strokeOpacity="0.5"
          strokeWidth="1.4"
        />

        {/* sulci — decorative folds, clipped to the cortex */}
        <g clipPath="url(#cortexClip)" stroke={INK3} strokeOpacity="0.28" strokeWidth="1" fill="none">
          <path d="M70,92 C120,78 190,78 250,92 C286,101 306,110 318,120" />
          <path d="M60,124 C120,116 200,120 268,132 C294,137 308,140 320,140" />
          <path d="M74,158 C130,154 200,158 262,166" />
          <path d="M92,192 C140,190 196,192 240,190" />
          <path d="M150,60 C146,110 150,170 158,224" />
          <path d="M206,52 C202,108 206,168 214,214" />
        </g>

        {/* brainstem hint */}
        <path d="M150,232 C156,250 172,258 190,256" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" />

        {/* --- DORSAL attention network: superior-posterior (IPS/SPL) --- */}
        <g clipPath="url(#cortexClip)" style={{ transition: "opacity .3s" }}>
          <ellipse cx="238" cy="96" rx="52" ry="34" fill="url(#dorsalG)" opacity={dLit} transform="rotate(-12 238 96)" />
        </g>
        <ellipse
          cx="238" cy="96" rx="52" ry="34" transform="rotate(-12 238 96)"
          fill="none" stroke={INK} strokeWidth={dEmph ? 2 : 1.2}
          strokeOpacity={dOn ? 0.5 + t * 0.4 : 0.2} strokeDasharray={dEmph ? "" : "4 4"}
        />

        {/* --- VENTRAL salience network: anterior insula + inferior frontal --- */}
        <g clipPath="url(#cortexClip)">
          <ellipse cx="108" cy="168" rx="42" ry="30" fill="url(#ventralG)" opacity={vLit} transform="rotate(8 108 168)" />
        </g>
        <ellipse
          cx="108" cy="168" rx="42" ry="30" transform="rotate(8 108 168)"
          fill="none" stroke={ACCENT2} strokeWidth={vEmph ? 2.2 : 1.2}
          strokeOpacity={vOn ? 0.6 + t * 0.4 : 0.25} strokeDasharray={vEmph ? "" : "4 4"}
        />
      </g>

      {/* Both callouts follow one system: a vertical leader from the region it names out to
          a two-line label in a reserved gutter, title over descriptor. The leader crosses
          the cortex outline on its way out, which is what a callout is supposed to do; the
          type never does, which is what it was doing before. */}
      {labels && (
        <g fontFamily="system-ui, sans-serif">
          {/* dorsal — top gutter, leader down into the region's upper edge */}
          <line x1={fx(238)} y1="72" x2={fx(238)} y2="101" stroke={INK} strokeOpacity={dOn ? 0.4 : 0.15} strokeWidth="1" />
          <text x={fx(238)} y="50" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK} opacity={dOn ? 0.5 + t * 0.5 : 0.3}>
            DORSAL · ATTENTION
          </text>
          <text x={fx(238)} y="64" textAnchor="middle" fontSize="9" fill={INK3} opacity={dOn ? t : 0.25}>
            where focus is steered
          </text>

          {/* ventral — bottom-left gutter, leader down out of the region's lower edge */}
          <line x1="80" y1={fy(190)} x2="76" y2="296" stroke={ACCENT2} strokeOpacity={vOn ? 0.5 : 0.2} strokeWidth="1" />
          <text x="76" y="311" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={ACCENT2} opacity={vOn ? 0.6 + t * 0.4 : 0.3}>
            VENTRAL · SURPRISE
          </text>
          <text x="76" y="325" textAnchor="middle" fontSize="9" fill={INK3} opacity={vOn ? t : 0.25}>
            fires on the unexpected
          </text>
        </g>
      )}
    </svg>
  );
}
