// /run — one ad through the whole pipeline, as recorded by the pipeline.
//
// WHAT MAKES THIS DIFFERENT FROM /demo. /demo is a designed walkthrough: it explains the
// product using artifacts that were produced earlier and transcribed into the page. This
// route is the opposite discipline. Every number, path, hash and log line below was
// emitted by tools/capture/recorder.py at the moment the work happened, folded by
// tools/capture/summarize.py, and re-derived by scripts/verify.sh on every run of the
// gate. Editing this file cannot change a single measured value on the page.
//
// That constraint is the point. docs/strategy/PLAN.md § 0.3 is a list of claims the site
// used to make that no artifact in the tree supported ("500 ads from our design
// partners", a logo wall of advertisers who were not customers, a 92% accuracy figure
// traceable to someone else's marketing). The fix is not better proofreading. It is a
// page that structurally cannot say more than the run did.
//
// THE VERDICT LINE IS COMPUTED, NOT WRITTEN. encoderRan() reads the stage record. When
// the capture is from a laptop, this page leads with "no model ran" in the largest type
// on the screen. When it is from a provisioned box, the same code leads with the GPU it
// ran on. Neither sentence is available to be edited into the other.

import type { Metadata } from "next";

import StageBlock from "@/components/run/StageBlock";
import { capture, deviceLine, encoderRan, fmtMs } from "@/lib/run-capture";

export const metadata: Metadata = {
  title: "soma · one ad, end to end",
  description:
    "A recorded pass of the Soma pipeline: every stage, every artifact, every hash, including the stages that did not run.",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="truncate py-1 text-ink-3">{label}</dt>
      <dd className="break-words py-1 font-mono text-[12px] text-ink-2">{children}</dd>
    </div>
  );
}

export default function RunPage() {
  const cap = capture;
  const ran = encoderRan(cap);
  const { env, counts } = cap;
  const started = new Date(cap.startedAt);

  return (
    <main className="mx-auto max-w-[62rem] px-6 py-16 sm:px-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          Recorded pipeline run · {cap.runId}
        </p>
        <h1 className="mt-3 max-w-[22ch] text-balance text-section leading-[1.1] text-ink">
          One ad, end to end.
        </h1>
        <p className="mt-5 max-w-[68ch] text-pretty text-body text-ink-2">
          Every value on this page was written by the pipeline while it ran — not
          transcribed afterwards. The stages that did not run are here too, at the same
          size as the ones that did, because a record you can only read one way is not a
          record.
        </p>
      </header>

      {/* THE VERDICT. Largest thing on the page after the title, and derived from the
          stage record rather than from prose, so it cannot drift from the truth. */}
      <section
        className={`mt-12 rounded-2xl border p-6 ${
          ran ? "border-line bg-fill" : "border-neg/30 bg-fill"
        }`}
      >
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          Did a model run?
        </h2>
        <p
          className={`mt-3 max-w-[60ch] text-pretty text-[20px] leading-[1.35] ${
            ran ? "text-ink" : "text-neg"
          }`}
        >
          {ran
            ? `Yes — the TRIBE v2 forward pass completed on ${deviceLine(env)}.`
            : "No. This capture is from a host with no model stack, so the encoder stage did not run and no score on this page came from a neural pass."}
        </p>
        {!ran ? (
          <p className="mt-4 max-w-[68ch] text-pretty text-body text-ink-2">
            What it does show is every stage that surrounds the model — the file as it
            arrived, the shot boundaries, the re-cuts encoded for real by ffmpeg, and the
            publish path — with the timings and hashes they actually produced. The encoder
            needs a provisioned CUDA box and a human-accepted{" "}
            <span className="whitespace-nowrap">CC BY-NC 4.0</span> licence on{" "}
            <code className="font-mono text-[13px]">facebook/tribev2</code>; when that run
            happens, this page fills in from its record without a line of it being rewritten.
          </p>
        ) : null}
      </section>

      <section className="mt-14">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          The box this ran on
        </h2>
        <dl className="mt-4 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 text-meta">
          <Field label="started">{started.toISOString().replace("T", " ").slice(0, 19)} UTC</Field>
          <Field label="wall clock">{fmtMs(cap.elapsedMs)}</Field>
          <Field label="platform">{env.platform ?? "—"}</Field>
          <Field label="python">{env.python ?? "—"}</Field>
          <Field label="commit">{env.git ?? "—"}</Field>
          <Field label="ffmpeg">{env.ffmpeg ?? "absent"}</Field>
          <Field label="compute">{deviceLine(env)}</Field>
          <Field label="TRIBE v2 weights">
            {env.tribeWeights?.present ? env.tribeWeights.path : "not on this host"}
          </Field>
          <Field label="tesseract (OCR)">{env.tesseract ?? "absent — clarity measures nothing without it"}</Field>
          <Field label="faster-whisper (ASR)">
            {env.fasterWhisper?.present ? env.fasterWhisper.version ?? "present" : "absent — clarity measures nothing without it"}
          </Field>
        </dl>
        <p className="mt-5 max-w-[68ch] text-pretty text-meta text-ink-3">
          Recorded by observation, not by flag. The compute line comes from asking torch
          what device it has, so no argument to the pipeline can make this page claim a GPU
          that was not there.
        </p>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
            The run, stage by stage
          </h2>
          <p className="ml-auto text-meta text-ink-3">
            <span className="tabular-nums text-ink">{counts.ok}</span> ran ·{" "}
            <span className="tabular-nums text-ink">{counts.skipped}</span> did not ·{" "}
            <span className="tabular-nums text-ink">{counts.failed}</span> failed
          </p>
        </div>
        <ol className="mt-2">
          {cap.stages.map((stage, i) => (
            <StageBlock key={stage.key} stage={stage} index={i} />
          ))}
        </ol>
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
          How to check this
        </h2>
        <p className="mt-4 max-w-[68ch] text-pretty text-body text-ink-2">
          The record this page renders is committed at{" "}
          <code className="font-mono text-[13px]">{cap.sourceJsonl ?? "captures/…/run.jsonl"}</code>
          , one JSON object per event. The gate re-folds it and fails if this page and that
          file disagree, so the two cannot drift apart quietly.
        </p>
        <p className="mt-4 max-w-[68ch] text-pretty text-body text-ink-2">
          The artifact paths above are where those files sat on the machine that ran the
          pipeline; the footage itself is not in this repository, because it is large and
          it is not ours to redistribute. The hashes are, which is what makes them worth
          printing — they say which bytes were scored, and a file that does not hash to one
          of them is a different cut.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-fill p-4 font-mono text-[12px] leading-[1.7] text-ink-2">
{`# reproduce the fold
.venv/bin/python tools/capture/summarize.py ${cap.sourceJsonl ?? "captures/<id>/run.jsonl"}

# the gate's check
.venv/bin/python tools/capture/summarize.py --check

# the command that produced it
${cap.argv.map((a) => a.replace(/^\/.*\/(?=[^/]+$)/, "")).join(" ")}`}
        </pre>
      </section>
    </main>
  );
}
