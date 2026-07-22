"use client";

// A/B compare — overlay two predicted attention arcs on one shared, NORMALIZED timeline
// so clips of different lengths line up. Ported from the old demo/app.js initCompare:
//  - a getArc cache that memoizes SUCCESSES only — a rejected arc is evicted so a later
//    render retries instead of staying stuck on the error string after one transient fail
//  - sampleAt() resamples both arcs to ~120 points on u∈[0,1] (so a 15s and a 40s clip
//    overlay honestly on the same axis)
//  - two overlaid curves: B dashed + dimmer underneath, A solid on top
//  - a "who leads each moment" strip: A-leads = tall bright bar, B-leads = short dim bar,
//    so the two states differ by height AND luminance (not a near-identical hue)
//  - a plain-language summary: "A holds higher predicted attention X% of the clip"
// It re-renders on `videos` too, so live Supabase arcs merged after load appear in both
// dropdowns automatically (this is the old refreshCompare()).

import { useEffect, useRef, useState } from "react";
import { clamp01, sampleAt, type Arc } from "@/lib/arc";
import { loadArc } from "./live";
import type { VideoItem } from "./Picker";

const N = 120; // resample resolution — both arcs sampled to this many points
const COL_A = "#EAF6FA";
const COL_B = "#BFE0EC";

type CmpStatus = "loading" | "ok" | "same" | "error";

// Draw both curves + the who-leads strip; returns how many of the N moments A leads.
function drawCompare(canvas: HTMLCanvasElement | null, arcA: Arc, arcB: Arc): number {
  if (!canvas) return 0;
  const x = canvas.getContext("2d");
  if (!x) return 0;
  const W = canvas.width;
  const H = canvas.height;
  const pad = 10;
  const top = 12;
  const bot = H - 26;
  x.clearRect(0, 0, W, H);
  const X = (u: number) => pad + u * (W - 2 * pad);
  const Y = (v: number) => bot - clamp01(v) * (bot - top);
  // baseline
  x.strokeStyle = "rgba(255,255,255,.10)";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(pad, bot);
  x.lineTo(W - pad, bot);
  x.stroke();
  // "who leads each moment" strip along the bottom — A leads = tall bright bar, B leads =
  // short dim bar, so the two states differ by height AND luminance.
  let aWins = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const av = sampleAt(arcA, u);
    const bv = sampleAt(arcB, u);
    const aLead = av >= bv;
    if (aLead) aWins++;
    x.fillStyle = aLead ? "rgba(234,246,250,.85)" : "rgba(143,179,192,.7)";
    x.fillRect(X(u), bot + 6, (W - 2 * pad) / N + 0.8, aLead ? 9 : 4);
  }
  const curve = (arc: Arc, col: string, dash: number[]) => {
    x.save();
    x.setLineDash(dash);
    x.beginPath();
    x.lineWidth = 2.2;
    x.strokeStyle = col;
    x.shadowColor = col;
    x.shadowBlur = 8;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const px = X(u);
      const py = Y(sampleAt(arc, u));
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.stroke();
    x.restore();
  };
  curve(arcB, COL_B, [6, 5]); // B first, dashed + dimmer, so A reads on top
  curve(arcA, COL_A, []);
  return aWins;
}

type Props = { videos: VideoItem[] };

export default function Compare({ videos }: Props) {
  const [aId, setAId] = useState<string>(videos[0]?.id ?? "");
  const [bId, setBId] = useState<string>(videos[Math.min(1, videos.length - 1)]?.id ?? "");
  const [status, setStatus] = useState<CmpStatus>("loading");
  const [pa, setPa] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // getArc cache: memoize SUCCESSES only; evict a rejected arc so a later render retries
  // rather than staying stuck on the error after one transient failure (no reload).
  const cacheRef = useRef<Record<string, Promise<Arc>>>({});

  const getArc = (id: string): Promise<Arc> => {
    const it = videos.find((v) => v.id === id);
    if (!it) return Promise.reject(new Error("no item " + id));
    const cache = cacheRef.current;
    if (!cache[id]) {
      cache[id] = loadArc(it).catch((e: unknown) => {
        delete cache[id];
        throw e;
      });
    }
    return cache[id];
  };

  // Re-render whenever the selection OR the available arcs change: a live merge appends
  // options → this repaints and refreshes the summary. Mirrors the old refreshCompare().
  useEffect(() => {
    let cancelled = false;
    Promise.all([getArc(aId), getArc(bId)])
      .then(([arcA, arcB]) => {
        if (cancelled) return;
        const aWins = drawCompare(canvasRef.current, arcA, arcB);
        if (aId === bId) {
          setStatus("same");
          setPa(null);
        } else {
          setPa(Math.round((100 * aWins) / N));
          setStatus("ok");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setPa(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId, videos]);

  const titleFor = (id: string) => videos.find((v) => v.id === id)?.title ?? "—";

  const selectCls =
    "cursor-pointer rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#141416] px-3 py-2 font-mono text-[12px] text-[#F5F5F7] outline-none transition-colors hover:border-[rgba(255,255,255,0.14)] focus-visible:border-[#BFE0EC]";

  return (
    <section className="mt-[clamp(16px,3vh,24px)] rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[#0C0C0E] p-[clamp(20px,3vw,28px)]">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-[18px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#7C7C82]">
            3 · Compare · A / B
          </div>
          <h3 className="mb-1.5 text-[20px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            Which ad holds attention better, moment to moment?
          </h3>
          <p className="max-w-[58ch] text-[13.5px] leading-[1.55] text-[#ADADB2]">
            Overlay two predicted attention arcs on one timeline &mdash; the read most
            performance teams actually want. Test every cut, not just the one you can afford to
            panel.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <label className="flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#7C7C82]">
            A
            <select value={aId} onChange={(e) => setAId(e.target.value)} className={selectCls}>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#7C7C82]">
            B
            <select value={bId} onChange={(e) => setBId(e.target.value)} className={selectCls}>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={1040}
        height={210}
        role="img"
        aria-label="Two predicted attention arcs overlaid on one timeline for comparison"
        className="block h-auto w-full rounded-2xl"
      />

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-[#ADADB2]">
        <span className="inline-flex items-center gap-2">
          <i
            className="inline-block h-0 w-4 border-t-[3px] border-solid border-t-[#EAF6FA]"
            aria-hidden="true"
          />
          A · {titleFor(aId)}
        </span>
        <span className="inline-flex items-center gap-2">
          <i
            className="inline-block h-0 w-4 border-t-[3px] border-dashed border-t-[#BFE0EC]"
            aria-hidden="true"
          />
          B · {titleFor(bId)}
        </span>
        <span className="inline-flex items-center gap-2">
          bottom strip = who&rsquo;s predicted higher, each moment
        </span>
      </div>

      <div className="mt-3 min-h-[1.6em] font-mono text-[11.5px] leading-[1.6] tracking-[0.01em] text-[#ADADB2]">
        {status === "same" ? (
          <>
            Pick two <b className="text-[#F5F5F7]">different</b> ads to compare.
          </>
        ) : status === "error" ? (
          "Could not load one of the arcs."
        ) : status === "ok" && pa !== null ? (
          <>
            <b className="text-[#F5F5F7]">A</b> holds higher predicted attention{" "}
            <b className="text-[#F5F5F7]">{pa}%</b> of the clip; <b className="text-[#F5F5F7]">B</b>{" "}
            the other <b className="text-[#F5F5F7]">{100 - pa}%</b>.
          </>
        ) : null}
      </div>
    </section>
  );
}
