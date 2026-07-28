"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  MESSAGE_FIELDS,
  MESSAGE_FIELD_COPY,
  OBJECTIVES,
  PLACEMENTS,
  PLATFORMS,
  emptyBrief,
  validateBrief,
  type Brief,
} from "@/lib/batch";

type Phase = "idle" | "running" | "error";

export default function GenerateBeta() {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const problems = useMemo(() => validateBrief(brief), [brief]);
  const busy = phase === "running";

  const set = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBrief((b) => ({ ...b, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setMessage("");
    if (problems.length) {
      setPhase("error");
      setMessage(problems[0]);
      return;
    }

    setPhase("running");
    try {
      const res = await fetch("/api/generate/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, provider: "stub", n: 6, duration: 15, aspect: "9:16" }),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ error?: string; detail?: string; token?: string })
        | null;
      if (!body?.token) {
        throw new Error(body?.error ?? "Could not run generation beta.");
      }
      router.push(`/g/${body.token}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Could not run generation beta.");
    }
  };

  return (
    <div className="mx-auto max-w-[980px] px-[clamp(16px,4vw,24px)] pb-24 pt-[clamp(26px,5vw,44px)]">
      <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
        <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
        Generate beta
      </div>

      <h1 className="max-w-[18ch] text-balance text-hero text-ink">
        Brief in. Candidate openings{" "}
        <span className="font-serif font-normal italic">out</span>.
      </h1>
      <p className="mt-[18px] max-w-[62ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
        This is the narrow, honest version of generation: Soma plans six deliberately
        different openings from one brief, renders them through the generation pipeline,
        and ranks them when the scorer is available.
      </p>

      <form onSubmit={submit} className="mt-[clamp(34px,6vw,56px)] border-t border-line pt-8">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">01</span>
          <h2 className="text-section text-ink">The brief</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MESSAGE_FIELDS.map((f) => (
            <Field
              key={f}
              label={MESSAGE_FIELD_COPY[f].label}
              hint={MESSAGE_FIELD_COPY[f].hint}
              placeholder={MESSAGE_FIELD_COPY[f].placeholder}
              value={brief[f]}
              onChange={set(f)}
              disabled={busy}
              required
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Platform" value={brief.platform} onChange={set("platform")} options={PLATFORMS} disabled={busy} />
          <Select label="Placement" value={brief.placement} onChange={set("placement")} options={PLACEMENTS} disabled={busy} />
          <Select label="Objective" value={brief.objective} onChange={set("objective")} options={OBJECTIVES} disabled={busy} />
          <Field
            label="Audience"
            hint="Needed so the generated set scores under the same assumptions as a real batch."
            placeholder="cold US 25-44"
            value={brief.audience}
            onChange={set("audience")}
            disabled={busy}
            required
          />
        </div>

        <div className="mt-10 border-t border-line pt-8">
          {touched && problems.length ? (
            <ul className="mb-5 flex flex-col gap-2">
              {problems.map((p) => (
                <li key={p} className="flex gap-2.5 text-[13.5px] leading-[1.55] text-neg">
                  <span aria-hidden className="mt-[8px] h-px w-2.5 shrink-0 bg-neg" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}

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
              {busy ? "Generating…" : "Start generation run"}
            </button>
            <span className="text-[13px] text-ink-3">
              Creates a private result URL once the run finishes. Ranking appears only when the scorer box is available.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, hint, placeholder, value, onChange, disabled, required, type = "text",
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
        {label}
        {required ? <span className="text-neg"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-line bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors focus:border-ink-3 disabled:opacity-60"
      />
      {hint ? <span className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">{hint}</span> : null}
    </label>
  );
}

function Select({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
        {label}
        <span className="text-neg"> *</span>
      </span>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-2 w-full cursor-pointer rounded-xl border border-line bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors focus:border-ink-3 disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
