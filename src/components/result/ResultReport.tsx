"use client";

// The customer's read-out. What someone who uploaded a batch actually receives.
//
// ── WHY THIS IS NOT PreflightView ──────────────────────────────────────────────
//
// /preflight renders the same artifact and was the obvious thing to reuse. It is the
// wrong shell here, and reusing it would have been a real mistake rather than a shortcut:
// it opens on "Anyone can make a hundred ads. Nobody knows which one wins.", explains what
// fMRI is, argues the moat with our corpus counters, and closes on "Request early access."
// Every one of those is correct for a stranger being convinced and wrong for a customer
// who has already been convinced, already uploaded, and is here for an answer about THEIR
// footage. A deliverable that spends half its height pitching reads as an ad for the
// thing you already bought.
//
// So this page reuses the four INSTRUMENTS (PlayerPanel, AdList, OverlayPanel,
// HookCompare) — which are the actual work, are already correct, and would be pure
// duplication to rebuild — and wraps them in a report shell instead of a sales one.
//
// ── WHAT THE SHELL ADDS ────────────────────────────────────────────────────────
//
//   the verdict        which cut to run, and by how much, above the fold
//   weak spots         the timestamped stretches, per cut, as a table — the artifact has
//                      carried these all along and no page ever printed them plainly
//   the brief          echoed back, because clarity is 25% of the score and is computed
//                      against these exact words; a customer must be able to see that we
//                      scored against the message they meant
//   the limits         the artifact's OWN honesty fields, rendered rather than hidden:
//                      smallNCaveat, comparability.verdict, sanity, warnings, per-ad
//                      flags, the claim split, the licence
//
// That last section is the one worth defending. Printing "clarity could not be computed
// on this run because no speech-recognition backend was installed" costs a little polish
// and is the difference between a report and a scoreboard. ServiceTiers already sells
// "held-out evaluation you can inspect, including where it fails" — this is where that
// promise is either kept or quietly broken.
//
// Copy rule, same as demo2: NO em dashes. Commas, colons, full stops, parentheses.

import { useMemo, useState } from "react";

import AdList from "../preflight/AdList";
import HookCompare from "../preflight/HookCompare";
import OverlayPanel from "../preflight/OverlayPanel";
import PlayerPanel from "../preflight/PlayerPanel";
import { HOOK_SECONDS } from "../preflight/lanes";
import type { PreflightAd, PreflightReport } from "../preflight/types";
import { fmtT } from "../demo2/types";

// Per-ad flags the pipeline may attach, in plain English. An unmapped flag still renders
// (as its raw key) rather than being swallowed: a flag nobody has written copy for is
// exactly the one worth seeing.
const FLAG_COPY: Record<string, string> = {
  no_asr_backend:
    "No speech recognition ran, so nothing spoken in this cut was checked against the message.",
  no_ocr_backend:
    "No text recognition ran, so on-screen type in this cut was not read.",
  no_content_extracted:
    "No words were recovered from this cut, by either channel.",
  no_identity_text:
    "The brand name was not found in the opening seconds.",
  shorter_than_hook_window: `This cut is shorter than the ${HOOK_SECONDS}s hook window, so it has no hook to score.`,
  no_audio_track: "This cut has no audio track.",
};

/** Clarity is 25% of the score and is computed from ASR + OCR. If neither backend ran,
 *  every ad ties and that quarter of the score is carrying no information. The customer
 *  is told, at the top of the limits, not left to infer it from four identical 50s. */
function clarityIsBlind(report: PreflightReport): boolean {
  const flagged = report.ads.filter((a) =>
    (a.flags ?? []).some((f) => f === "no_asr_backend" || f === "no_ocr_backend"),
  );
  return flagged.length === report.ads.length && report.ads.length > 0;
}

export default function ResultReport({
  report,
  batchName,
  generatedAt,
}: {
  report: PreflightReport;
  batchName: string;
  generatedAt: string | null;
}) {
  const [selectedId, setSelectedId] = useState(report.bestId);
  const selected = report.ads.find((a) => a.id === selectedId) ?? report.ads[0];

  const ordered = useMemo(
    () =>
      report.order
        .map((id) => report.ads.find((a) => a.id === id))
        .filter(Boolean) as PreflightAd[],
    [report.order, report.ads],
  );

  const best = report.ads.find((a) => a.id === report.bestId) ?? ordered[0];
  const worst = report.ads.find((a) => a.id === report.worstId) ?? ordered[ordered.length - 1];
  const margin =
    best && worst ? Math.round(best.scores.preflight - worst.scores.preflight) : 0;

  const message = report.batch?.message;
  const blindClarity = clarityIsBlind(report);

  // Every cut that has at least one weak stretch. Kept in rank order so the table reads
  // top to bottom the same way the ranking does.
  const withWeakSpots = ordered.filter((a) => (a.weakSpots ?? []).length > 0);

  return (
    <div className="mx-auto max-w-[1100px] px-[clamp(18px,5vw,40px)] pb-32 pt-[clamp(28px,6vh,64px)]">
      {/* ── the verdict ───────────────────────────────────────────────────────
          What they paid for, above the fold, in one sentence. Everything below is
          the evidence for this line. */}
      <header>
        <div className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
          Read-out · {report.batch?.nAds ?? report.ads.length} cuts
          {generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </div>
        <h1 className="mt-3 max-w-[22ch] text-balance text-hero text-ink">
          {best ? (
            <>
              Run <span className="font-serif font-normal italic">{best.title}</span>.
            </>
          ) : (
            <>Your batch, ranked.</>
          )}
        </h1>
        <p className="mt-5 max-w-[60ch] text-pretty text-body text-ink-2">
          {batchName}
          {message?.brandName ? ` · ${message.brandName}` : ""}
          {message?.productName ? ` ${message.productName}` : ""}. It scored{" "}
          <span className="tabular-nums text-ink">{Math.round(best?.scores.preflight ?? 0)}</span>{" "}
          against {worst?.title ?? "the weakest cut"} at{" "}
          <span className="tabular-nums text-ink">{Math.round(worst?.scores.preflight ?? 0)}</span>
          {margin > 0 ? `, a ${margin}-point spread across the batch` : ""}.
        </p>
        {/* The caveat travels WITH the verdict, not in a footnote. The artifact
            computes it (scoring.smallNCaveat) and it is the single most important
            sentence for reading the number above correctly. */}
        {report.scoring?.smallNCaveat ? (
          <p className="mt-4 max-w-[64ch] rounded-xl border border-line-2 bg-fill px-4 py-3 text-[13px] leading-[1.6] text-ink-2">
            <span className="font-serif italic">How to read these:</span>{" "}
            {report.scoring.smallNCaveat}
          </p>
        ) : null}
      </header>

      {/* ── the read-out ──────────────────────────────────────────────────────
          The clip on the left, its lanes on the right, one clock between them, and
          the batch under it to switch between. Identical instrument to /preflight;
          the selection is shared with the comparison below. */}
      <Block title="Every cut, second by second" n="01">
        {selected ? (
          <div className="flex flex-col gap-8">
            {/* Keyed on the ad: switching cuts remounts the panel, the <video> and the
                video clock together, so no playhead or buffer state leaks across. */}
            <PlayerPanel key={selected.id} ad={selected} report={report} active />
            <AdList
              ads={ordered}
              report={report}
              selectedId={selectedId}
              onSelect={setSelectedId}
              orientation="row"
              active
            />
          </div>
        ) : null}
      </Block>

      {/* ── the batch ─────────────────────────────────────────────────────── */}
      <Block
        title="The batch on one axis"
        n="02"
        lede="Change the lane and the batch answers a different question: which cut held the eye, which surprised, and which one actually registered."
      >
        <OverlayPanel
          report={report}
          selectedId={selectedId}
          onSelect={setSelectedId}
          active
        />
      </Block>

      {/* ── the hook ──────────────────────────────────────────────────────── */}
      <Block
        title="The first three seconds"
        n="03"
        lede={`Every cut's first ${HOOK_SECONDS} seconds are scored separately, and worth ${Math.round((report.weights?.hook ?? 0.4) * 100)}% of the total. The ventral surprise signal is what measures it: a hook works by being unexpected.`}
      >
        <HookCompare report={report} active />
      </Block>

      {/* ── weak spots ────────────────────────────────────────────────────────
          The timestamped stretches, plainly. These have been in the artifact since
          the first run and no page has ever printed them as a list you can act on,
          which is odd given it is the thing the product promises by name. `depth`
          is how far below the clip's own median the stretch ran, in robust SDs. */}
      <Block
        title="Where attention leaks"
        n="04"
        lede="Stretches at least three seconds long that run measurably below the cut's own median. These are the timestamps to look at first."
      >
        {withWeakSpots.length === 0 ? (
          <p className="rounded-2xl border border-line bg-fill p-5 text-body text-ink-2">
            No stretch in any cut in this batch stayed below its own median long enough to
            flag. That is a clean result, not a missing one.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            {withWeakSpots.map((ad, i) => (
              <div
                key={ad.id}
                className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-8 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <div className="sm:w-[220px] sm:shrink-0">
                  <div className="text-ui font-medium text-ink">{ad.title}</div>
                  <div className="mt-0.5 text-[12px] uppercase tracking-[0.06em] text-ink-3">
                    rank {ad.rank} · {Math.round(ad.scores.preflight)}
                  </div>
                </div>
                <ul className="flex min-w-0 flex-1 flex-col gap-2">
                  {(ad.weakSpots ?? []).map((w, j) => (
                    <li key={j} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px] leading-[1.5]">
                      <span className="tabular-nums font-medium text-ink">
                        {fmtT(w.start)} to {fmtT(w.end)}
                      </span>
                      <span className="text-ink-3">{w.secs}s</span>
                      <span className="text-ink-2">
                        {/* Named for what it is. "depth" alone is a number with no unit
                            a reader could act on. */}
                        {w.depth.toFixed(1)} SD below this cut&rsquo;s median
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* ── the brief ─────────────────────────────────────────────────────────
          Echoed back verbatim. Clarity is 25% of the score and is computed against
          exactly these strings, so a customer who typed the wrong product name has
          a quarter of their score measured against the wrong thing. The only way
          they can catch that is if we show them what we used. */}
      {message ? (
        <Block
          title="What we scored the message against"
          n="05"
          lede="Comprehension is checked against these words, on screen and out loud. If any of this is wrong, that part of the score is measuring the wrong thing, and it is worth telling us."
        >
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {[
              ["Brand", message.brandName],
              ["Product", message.productName],
              ["Problem", message.primaryProblem],
              ["Promise", message.primaryBenefit],
              ["Offer", message.offer],
              ["Call to action", message.desiredCta],
            ].map(([k, v]) => (
              <div key={k} className="bg-paper p-4">
                <dt className="text-[12px] uppercase tracking-[0.07em] text-ink-3">{k}</dt>
                <dd className="mt-1.5 text-body text-ink">{v || <span className="text-ink-3">not given</span>}</dd>
              </div>
            ))}
          </dl>
          {report.batch ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                report.batch.platform,
                report.batch.placement,
                report.batch.objective,
                report.batch.audience,
                report.batch.durationBucket,
              ]
                .filter(Boolean)
                .map((chip) => (
                  <span
                    key={String(chip)}
                    className="rounded-xl border border-line-2 px-[13px] py-[8px] text-[12.5px] font-medium leading-none tracking-[-0.01em] text-ink-2"
                  >
                    {String(chip)}
                  </span>
                ))}
            </div>
          ) : null}
        </Block>
      ) : null}

      {/* ── the limits ────────────────────────────────────────────────────────
          The artifact's own honesty fields, rendered. Not a disclaimer block: each
          line here is a specific, checkable statement about THIS run. */}
      <Block
        title="What this run can and cannot tell you"
        n="06"
        lede="Every line below is about this batch specifically, read straight out of the file the pipeline produced."
      >
        <div className="flex flex-col gap-3">
          {blindClarity ? (
            <Limit tone="warn" label="Comprehension did not measure anything on this run">
              No speech-recognition or text-recognition backend was available, so no words
              were recovered from any cut and every ad tied on clarity. That is a quarter of
              the score carrying no information. The attention and surprise components are
              unaffected.
            </Limit>
          ) : null}

          {(report.warnings ?? []).map((w, i) => (
            <Limit key={i} tone="warn" label="Warning from the run">
              {w}
            </Limit>
          ))}

          {report.comparability ? (
            <Limit
              tone={report.comparability.crossAdLevelsTrustworthy ? "ok" : "warn"}
              label={
                report.comparability.crossAdLevelsTrustworthy
                  ? "Cuts are comparable to each other"
                  : "Cross-cut levels are not trustworthy on this run"
              }
            >
              {report.comparability.note}
            </Limit>
          ) : null}

          {report.sanity ? (
            <Limit
              tone={report.sanity.visualPositive ? "ok" : "warn"}
              label={
                report.sanity.visualPositive
                  ? "The pipeline's own sanity check passed"
                  : "The pipeline's sanity check FAILED, do not act on these numbers"
              }
            >
              {report.sanity.note}
            </Limit>
          ) : null}

          {report.claim ? (
            <Limit tone="note" label="What is proven, and what is our hypothesis">
              <span className="font-medium text-ink">Validated:</span> {report.claim.validated}.{" "}
              <span className="font-medium text-ink">Hypothesis:</span> {report.claim.hypothesis}.
            </Limit>
          ) : null}

          {/* Per-cut flags, only where a cut has any. */}
          {ordered.some((a) => (a.flags ?? []).length > 0) ? (
            <Limit tone="note" label="Per-cut notes">
              <ul className="mt-1 flex flex-col gap-1.5">
                {ordered.flatMap((a) =>
                  (a.flags ?? []).map((f) => (
                    <li key={`${a.id}-${f}`}>
                      <span className="font-medium text-ink">{a.title}:</span>{" "}
                      {FLAG_COPY[f] ?? f}
                    </li>
                  )),
                )}
              </ul>
            </Limit>
          ) : null}
        </div>

        {/* Provenance. Small, last, and complete: which script, which model, which
            modality, under what licence. A reader who wants to check us can. */}
        <div className="mt-6 border-t border-line pt-4 font-mono text-[11px] leading-[1.7] text-ink-3">
          {report.generator ? (
            <div>
              {report.generator.script} · {report.generator.hfModel} · modality{" "}
              {report.generator.modality} · arc ROI {report.generator.arcRoi}
            </div>
          ) : null}
          {report.chart?.arcRoiLabel ? <div>{report.chart.arcRoiLabel}</div> : null}
          {generatedAt ? <div>run {new Date(generatedAt).toISOString()}</div> : null}
          {report.license ? <div>{report.license}</div> : null}
        </div>
      </Block>
    </div>
  );
}

// ── shell pieces ────────────────────────────────────────────────────────────────

function Block({
  n,
  title,
  lede,
  children,
}: {
  n: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-[clamp(44px,8vh,84px)] border-t border-line pt-8">
      <div className="flex items-baseline gap-3">
        <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">{n}</span>
        <h2 className="text-section text-ink">{title}</h2>
      </div>
      {lede ? (
        <p className="mt-3 max-w-[64ch] text-pretty text-body text-ink-2">{lede}</p>
      ) : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Limit({
  tone,
  label,
  children,
}: {
  tone: "ok" | "warn" | "note";
  label: string;
  children: React.ReactNode;
}) {
  // Colour AND a glyph AND a word: the three states must be distinguishable without
  // relying on hue, per docs/DESIGN-SYSTEM.md.
  const dot =
    tone === "warn" ? "bg-neg" : tone === "ok" ? "bg-pos" : "bg-line-2";
  return (
    <div className="rounded-2xl border border-line bg-fill p-4">
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-ui font-medium text-ink">{label}</span>
      </div>
      <div className="mt-2 max-w-[76ch] text-[13.5px] leading-[1.6] text-ink-2">{children}</div>
    </div>
  );
}
