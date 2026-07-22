"use client";

// The ad picker. Sample cards seeded from public/arcs/*.json. real1 is the one REAL
// frozen-TRIBE run; the others are illustrative samples and are marked as such (a
// per-card amber "◆ ILLUSTRATIVE SAMPLE" pill) so authoritative-looking overlays on
// synthetic data can never read as fabricated. Each card's thumb carries a faint,
// DECORATIVE cortical-signal motif — not real data, a stable per-id identity mark
// (deterministic hash → seeded PRNG → smoothstep sparkline), like the gradient behind
// it. Booting on real1 (never synthetic) is enforced by DemoConsole.

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
// missing json would paint a "Could not load" error frame. real1 = the real run;
// the two hero cards are illustrative samples.
export const VIDEOS: VideoItem[] = [
  {
    id: "real1",
    title: "Real TRIBE run · TVSum clip",
    src: "real · TRIBE v2",
    arc: "/arcs/real_esJrBWj2d8.json",
    grad: "linear-gradient(140deg,#1c2e3a,#0a0f16 60%,#05070b)",
  },
  {
    id: "hero1",
    title: "Skincare launch",
    src: "DTC · sample",
    arc: "/arcs/sample_arc.json",
    grad: "linear-gradient(135deg,#2b3d4c,#0c1119 62%,#05070b)",
  },
  {
    id: "hero2",
    title: "App promo",
    src: "performance · sample",
    arc: "/arcs/hero2.json",
    grad: "linear-gradient(120deg,#20313e,#0a0f16 58%,#05070b)",
  },
];

// real1 is the only real run: everything else (or anything tagged "sample") is illustrative.
export function isSample(v: VideoItem): boolean {
  return /sample/i.test(v.src || "") || v.id !== "real1";
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
  x.strokeStyle = "rgba(191,224,236,.55)";
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
        "group cursor-pointer overflow-hidden rounded-[18px] border bg-[#141416] transition-all hover:-translate-y-[3px] " +
        (active
          ? "border-[#BFE0EC] shadow-[0_0_0_1px_#BFE0EC,0_20px_44px_-26px_rgba(191,224,236,0.4)]"
          : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.14)]")
      }
    >
      <div
        className="relative flex aspect-[16/10] items-end justify-end overflow-hidden p-2.5"
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
          <div className="absolute left-2.5 top-2.5 rounded-full border border-[rgba(255,203,92,0.45)] bg-[rgba(20,15,4,0.74)] px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.06em] text-[#FFCB5C]">
            ◆ Illustrative sample
          </div>
        ) : null}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(8,9,12,0.55)] transition-transform group-hover:scale-[1.08]">
          <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3 fill-[#F5F5F7]">
            <polygon points="2,1 11,6 2,11" />
          </svg>
        </div>
        <div className="relative rounded-md bg-[rgba(8,9,12,0.6)] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.04em] text-white">
          {durLabel(dur)}
        </div>
      </div>
      <div className="px-3 py-2.5 text-[13px] font-semibold tracking-[-0.01em] text-[#F5F5F7]">
        {video.title}
        <span className="mt-[3px] block font-mono text-[10px] font-normal uppercase tracking-[0.05em] text-[#7C7C82]">
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
