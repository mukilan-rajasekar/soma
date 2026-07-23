"use client";

// The ad picker. Every card is a REAL frozen-TRIBE v2 run — seeded from the overnight
// trimodal extract (public/arcs/arc_<id>.json) plus the welding-cut flagship, which is
// the one card that also carries the per-network cortical profile. Titles describe each
// ad's actual attention shape (front-loaded / late-peak / etc.), read straight off the
// curve. Each card's thumb carries a faint, DECORATIVE cortical-signal motif — a stable
// per-id identity mark (deterministic hash → seeded PRNG → smoothstep sparkline), like
// the gradient behind it. Booting on the flagship is enforced by DemoConsole.

import { useEffect, useRef } from "react";
import type { Arc } from "@/lib/arc";

export type VideoItem = {
  id: string;
  title: string;
  src: string;
  arc: string; // URL to a static arc json under /public (empty "" for live inline arcs)
  grad: string; // CSS gradient for the thumb background
  arcData?: Arc; // inline in-memory arc (live Supabase rows) — resolved instead of `arc`
};

// Only the arcs that actually exist under public/arcs are seeded — referencing a
// missing json would paint a "Could not load" error frame. Every entry is a real
// trimodal TRIBE v2 run; the flagship (real_meta12) boots first and is the one card
// that also carries the per-network cortical profile.
// Thumb gradients are near-white, faintly slate — on-palette identity marks (the
// per-card sparkline motif carries the real distinction). Never the old neon-on-black.
export const VIDEOS: VideoItem[] = [
  {
    id: "real2",
    title: "Welding-gear DR ad",
    src: "trimodal",
    arc: "/arcs/real_meta12.json",
    grad: "linear-gradient(140deg,#ffffff,#eef2f3 60%,#e6ebec)",
  },
  // --- 10 real ads from the overnight trimodal extract, curated for a spread of
  // attention shapes (front-loaded → mid → late-peak) and lengths (8s → 82s). Titles
  // name each ad by its advertiser/product, from the harvested TikTok/Meta metadata. ---
  {
    id: "tt_318",
    title: "Stanley Quencher",
    src: "trimodal",
    arc: "/arcs/arc_tt_318.json",
    grad: "linear-gradient(135deg,#ffffff,#f0f4f5 60%,#e8eeef)",
  },
  {
    id: "tt_342",
    title: "Spider-Man trailer",
    src: "trimodal",
    arc: "/arcs/arc_tt_342.json",
    grad: "linear-gradient(140deg,#ffffff,#eff3f4 60%,#e7edee)",
  },
  {
    id: "tt_702",
    title: "Dr.G K-beauty",
    src: "trimodal",
    arc: "/arcs/arc_tt_702.json",
    grad: "linear-gradient(135deg,#ffffff,#f2f4f5 60%,#eaeeef)",
  },
  {
    id: "tt_449",
    title: "3-step skincare",
    src: "trimodal",
    arc: "/arcs/arc_tt_449.json",
    grad: "linear-gradient(135deg,#ffffff,#eef3f2 60%,#e6ecea)",
  },
  {
    id: "tt_506",
    title: "Sneaker drop",
    src: "trimodal",
    arc: "/arcs/arc_tt_506.json",
    grad: "linear-gradient(120deg,#ffffff,#f2f5f4 58%,#eaefed)",
  },
  {
    id: "tt_264",
    title: "Sofa showroom",
    src: "trimodal",
    arc: "/arcs/arc_tt_264.json",
    grad: "linear-gradient(140deg,#ffffff,#f1f4f5 60%,#e9eeef)",
  },
  {
    id: "tt_44",
    title: "Lip balm",
    src: "trimodal",
    arc: "/arcs/arc_tt_44.json",
    grad: "linear-gradient(120deg,#ffffff,#f1f4f4 58%,#e9eeed)",
  },
  {
    id: "tt_313",
    title: "Duckbill cap",
    src: "trimodal",
    arc: "/arcs/arc_tt_313.json",
    grad: "linear-gradient(140deg,#ffffff,#eef2f3 60%,#e6ebec)",
  },
  {
    id: "tt_102",
    title: "Retro photo filter",
    src: "trimodal",
    arc: "/arcs/arc_tt_102.json",
    grad: "linear-gradient(135deg,#ffffff,#f2f5f6 62%,#eaeeef)",
  },
  {
    id: "meta_01",
    title: "Meta ad",
    src: "trimodal",
    arc: "/arcs/arc_meta_01.json",
    grad: "linear-gradient(120deg,#ffffff,#f0f4f5 58%,#e8eded)",
  },
];

// The seeded cards are all real TRIBE runs, so none are watermarked. The sample
// mechanism is retained only as a guard: a card would be flagged if its source were
// ever labelled a sample (e.g. a future placeholder), never for real model output.
export function isSample(v: VideoItem): boolean {
  return /sample/i.test(v.src || "");
}

function durLabel(dur: number | undefined): string {
  if (typeof dur === "number" && dur > 0) {
    const s = Math.round(dur);
    return s >= 60
      ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")
      : s + "s";
  }
  return "30s";
}

// deterministic hash → seeded PRNG, so each card's motif is stable per id.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// paint a faint DECORATIVE cortical-signal motif on a card thumb (not real data — an
// abstract identity mark, no axes, no numbers): one clean deterministic sparkline.
function paintThumb(canvas: HTMLCanvasElement | null, id: string): void {
  if (!canvas || !canvas.getContext) return;
  const x = canvas.getContext("2d");
  if (!x) return;
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(hashStr(id));
  const pts = 7;
  x.clearRect(0, 0, W, H);
  const ys: number[] = [];
  for (let i = 0; i < pts; i++) ys.push(H * 0.46 + (rnd() - 0.5) * H * 0.34);
  x.beginPath();
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    const f = u * (pts - 1);
    const k = Math.floor(f);
    const fr = f - k;
    const a = ys[k];
    const b = ys[Math.min(k + 1, pts - 1)];
    const sm = fr * fr * (3 - 2 * fr);
    const y = a + (b - a) * sm;
    const px = 6 + u * (W - 12);
    if (i) x.lineTo(px, y);
    else x.moveTo(px, y);
  }
  x.strokeStyle = "rgba(95,139,153,.6)"; // --color-accent-2 (#5f8b99), slate on near-white
  x.lineWidth = 1.5;
  x.stroke();
}

type CardProps = {
  video: VideoItem;
  active: boolean;
  dur: number | undefined;
  onPick: (v: VideoItem) => void;
};

function Card({ video, active, dur, onPick }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    paintThumb(canvasRef.current, video.id);
  }, [video.id]);

  const sample = isSample(video);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Analyze ${video.title}`}
      onClick={() => onPick(video)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(video);
        }
      }}
      className={
        "group cursor-pointer overflow-hidden rounded-xl border bg-paper transition-all hover:-translate-y-[2px] " +
        (active
          ? "border-ink"
          : "border-line hover:border-line-2")
      }
    >
      <div
        className="relative flex aspect-[16/10] items-end justify-end overflow-hidden p-2"
        style={{ background: video.grad }}
      >
        <canvas
          ref={canvasRef}
          width={300}
          height={188}
          aria-hidden="true"
          className="absolute inset-0 block h-full w-full opacity-90"
        />
        {sample ? (
          <div className="absolute left-1.5 top-1.5 rounded-full border border-line bg-paper px-1.5 py-[2px] text-[8.5px] uppercase tracking-[0.05em] text-ink-2">
            <span className="text-ink-3">◆</span> sample
          </div>
        ) : null}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink/75 transition-transform group-hover:scale-[1.04]">
          <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5 fill-white">
            <polygon points="2,1 11,6 2,11" />
          </svg>
        </div>
        <div className="relative rounded bg-ink/70 px-1 py-0.5 text-[9px] tabular-nums tracking-[0.04em] text-paper">
          {durLabel(dur)}
        </div>
      </div>
      <div className="px-2.5 py-2 text-[12px] font-medium leading-snug tracking-[-0.01em] text-ink">
        <span className="line-clamp-2">{video.title}</span>
        <span className="mt-1 block truncate text-[9px] font-normal uppercase tracking-[0.05em] text-ink-3">
          {video.src}
        </span>
      </div>
    </div>
  );
}

type Props = {
  videos: VideoItem[];
  currentId: string | null;
  durations: Record<string, number>;
  onPick: (v: VideoItem) => void;
};

export default function Picker({ videos, currentId, durations, onPick }: Props) {
  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
      {videos.map((v) => (
        <Card
          key={v.id}
          video={v}
          active={currentId === v.id}
          dur={durations[v.id]}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
