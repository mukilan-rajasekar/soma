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
// Thumb gradients are near-white, faintly slate — on-palette identity marks (the
// per-card sparkline motif carries the real distinction). Never the old neon-on-black.
export const VIDEOS: VideoItem[] = [
  {
    id: "real2",
    title: "Welding-gear DR ad · cut",
    src: "real · trimodal",
    arc: "/arcs/real_meta12.json",
    grad: "linear-gradient(140deg,#ffffff,#eef2f3 60%,#e6ebec)",
  },
  {
    id: "real1",
    title: "Real TRIBE run · TVSum clip",
    src: "real · TRIBE v2",
    arc: "/arcs/real_esJrBWj2d8.json",
    grad: "linear-gradient(140deg,#ffffff,#f1f4f5 60%,#e9eeef)",
  },
  {
    id: "hero1",
    title: "Skincare launch",
    src: "DTC · sample",
    arc: "/arcs/sample_arc.json",
    grad: "linear-gradient(135deg,#ffffff,#f2f5f6 62%,#eaeeef)",
  },
  {
    id: "hero2",
    title: "App promo",
    src: "performance · sample",
    arc: "/arcs/hero2.json",
    grad: "linear-gradient(120deg,#ffffff,#f0f4f5 58%,#e8eded)",
  },
  // --- 7 real TikTok Top Ads (from the harvested corpus), spanning the CTR range so the
  // demo shows the read-outs on winners vs losers. The CTR labels are REAL TikTok data;
  // the brain arcs are ILLUSTRATIVE SAMPLES (src "· sample" => watermarked) until the
  // overnight Colab extracts real frozen-TRIBE preds for these clips and regenerates the
  // arcs (readout_extract → arc_<id>.json). Ordered high → mid → low CTR. ---
  {
    id: "tt_60",
    title: "@editingnews · Games — high CTR (p99)",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_60_sample.json",
    grad: "linear-gradient(135deg,#ffffff,#eef3f2 60%,#e6ecea)",
  },
  {
    id: "tt_28",
    title: "@wigchichair · Wig & hair — high CTR",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_28_sample.json",
    grad: "linear-gradient(140deg,#ffffff,#f1f4f5 60%,#e9eeef)",
  },
  {
    id: "tt_150",
    title: "Food & produce — high CTR",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_150_sample.json",
    grad: "linear-gradient(120deg,#ffffff,#f2f5f4 58%,#eaefed)",
  },
  {
    id: "tt_544",
    title: "skinguardian · Cosmetics — mid CTR",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_544_sample.json",
    grad: "linear-gradient(135deg,#ffffff,#f0f4f5 60%,#e8eeef)",
  },
  {
    id: "tt_455",
    title: "Men's shoes — mid CTR",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_455_sample.json",
    grad: "linear-gradient(140deg,#ffffff,#eff3f4 60%,#e7edee)",
  },
  {
    id: "tt_82",
    title: "@Verb · Beverage — low CTR (p01)",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_82_sample.json",
    grad: "linear-gradient(120deg,#ffffff,#f1f4f4 58%,#e9eeed)",
  },
  {
    id: "tt_74",
    title: "Short-drama app — low CTR",
    src: "TikTok Top Ads · sample",
    arc: "/arcs/tt_74_sample.json",
    grad: "linear-gradient(135deg,#ffffff,#f2f4f5 60%,#eaeeef)",
  },
];

// real1 is the only real run: everything else (or anything tagged "sample") is illustrative.
// A card is an ILLUSTRATIVE SAMPLE (synthetic — gets the watermark) only when its
// source is labelled a sample. Real TRIBE runs (src "real · …") and validated live
// Supabase rows are real model output and must NOT be watermarked as synthetic.
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
        <div className="relative rounded bg-ink/70 px-1 py-0.5 text-[9px] tabular-nums tracking-[0.04em] text-white">
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
