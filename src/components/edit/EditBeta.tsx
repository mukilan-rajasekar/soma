"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Variant = {
  id: string;
  title: string;
};

type BatchOption = {
  id: string;
  title: string;
  score: number;
};

type BatchPreset = {
  token: string;
  batchName: string;
  options: BatchOption[];
  defaultAdId: string;
};

type Phase = "idle" | "running" | "error";

export default function EditBeta({
  demoVariants,
  defaultDemoAdId,
  batchPreset,
}: {
  demoVariants: Variant[];
  defaultDemoAdId: string;
  batchPreset?: BatchPreset | null;
}) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState<"demo" | "batch">(
    batchPreset ? "batch" : "demo",
  );
  const [demoAd, setDemoAd] = useState(defaultDemoAdId);
  const [batchAd, setBatchAd] = useState(batchPreset?.defaultAdId ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  const busy = phase === "running";
  const options = useMemo(
    () =>
      sourceKind === "batch"
        ? (batchPreset?.options ?? []).map((option) => ({
            value: option.id,
            label: `${option.title} · ${Math.round(option.score)}`,
          }))
        : demoVariants.map((variant) => ({
            value: variant.id,
            label: variant.title,
          })),
    [batchPreset?.options, demoVariants, sourceKind],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("running");
    setMessage("");

    const ad = sourceKind === "batch" ? batchAd : demoAd;
    if (!ad) {
      setPhase("error");
      setMessage(
        sourceKind === "batch" ? "Pick a customer cut to edit." : "Pick a demo cut to edit.",
      );
      return;
    }

    try {
      const res = await fetch("/api/edit/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad,
          top: 3,
          sourceKind,
          batchToken: sourceKind === "batch" ? batchPreset?.token ?? "" : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ error?: string; detail?: string; token?: string })
        | null;
      if (!body?.token) {
        throw new Error(body?.error ?? "Could not run edit beta.");
      }
      router.push(`/e/${body.token}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Could not run edit beta.");
    }
  };

  return (
    <div className="mx-auto max-w-[980px] px-[clamp(16px,4vw,24px)] pb-24 pt-[clamp(26px,5vw,44px)]">
      <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
        <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
        Edit beta
      </div>

      <h1 className="max-w-[18ch] text-balance text-hero text-ink">
        Search the best{" "}
        <span className="font-serif font-normal italic">re-cut</span>.
      </h1>
      <p className="mt-[18px] max-w-[62ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
        This is the narrow, honest version of editing: Soma searches a bounded edit space,
        estimates which re-cuts help most, renders the top few, and verifies them when the
        scorer is available.
      </p>

      <form onSubmit={submit} className="mt-[clamp(34px,6vw,56px)] border-t border-line pt-8">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">01</span>
          <h2 className="text-section text-ink">Pick the source cut</h2>
        </div>

        {batchPreset ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { id: "batch", label: "Customer batch" },
              { id: "demo", label: "Demo campaign" },
            ].map((mode) => {
              const active = sourceKind === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSourceKind(mode.id as "demo" | "batch")}
                  className={`cursor-pointer rounded-xl border px-4 py-[10px] text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "border-ink bg-fill font-medium text-ink"
                      : "border-line bg-paper text-ink-2 hover:border-line-2"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <label className="flex max-w-[460px] flex-col">
          <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
            {sourceKind === "batch" ? "Scored customer cut" : "Demo campaign cut"}
          </span>
          <select
            value={sourceKind === "batch" ? batchAd : demoAd}
            onChange={(e) =>
              sourceKind === "batch" ? setBatchAd(e.target.value) : setDemoAd(e.target.value)
            }
            disabled={busy || options.length === 0}
            className="mt-2 w-full cursor-pointer rounded-xl border border-line bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors focus:border-ink-3 disabled:opacity-60"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">
            {sourceKind === "batch"
              ? `Pulled from ${batchPreset?.batchName}. These are the real cuts you already scored.`
              : "Falls back to the shipped demo campaign when you are not coming from a customer run."}
          </span>
        </label>

        <div className="mt-10 border-t border-line pt-8">
          {message ? (
            <p className={`mb-5 text-[13.5px] leading-[1.55] ${phase === "error" ? "text-neg" : "text-ink-2"}`}>
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className="cursor-pointer rounded-xl bg-ink px-6 py-[14px] text-ui font-medium text-paper transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Searching…" : "Start edit run"}
            </button>
            <span className="text-[13px] text-ink-3">
              Creates a private result URL once the run finishes. Verification appears only when the scorer box is available.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
