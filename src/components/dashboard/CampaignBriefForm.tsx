"use client";

// CampaignBriefForm — a short brief in, one weekly price out.
//
// THE PREVIEW AND THE SERVER PRICE THROUGH THE SAME MODULE (src/lib/pricing.ts), so the
// number that updates as you type is the number that comes back on submit. The preview is
// never the enforcement: the server rebuilds the spec, prices it again, and stores what it
// priced — this copy exists so nobody commits to a number they have not seen move.
//
// THE FORM NEVER SENDS A MARGIN. The default margin is baked into the pricing module and
// the route ignores anything else; the preview shows the margin line because hiding a
// fifth of the price would be the wrong kind of simple.

import { useMemo, useState } from "react";

import { quote, type Quote } from "@/lib/pricing";

type Phase = "idle" | "submitting" | "done" | "error";

type BrandOption = { id: string; name: string };

const PLATFORM_OPTIONS = [
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
] as const;

const GOAL_OPTIONS = [
  {
    value: "aggressive_conversions",
    label: "Aggressive conversion push",
    detail: "Optimized for conversions. No holdout — every dollar is in market.",
  },
  {
    value: "low_cost_testing",
    label: "Low-cost testing",
    detail: "Optimized for cheap clicks, with a 10% holdout and 3 test arms.",
  },
] as const;

function dollars(micros: number): string {
  return `$${(micros / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const LABEL = "text-[12px] uppercase tracking-[0.07em] text-ink-3";

export default function CampaignBriefForm({ brands }: { brands: BrandOption[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<string[]>(["meta"]);
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState<string>("aggressive_conversions");
  const [duration, setDuration] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Quote | null>(null);

  const busy = phase === "submitting";

  const spendMicros = useMemo(() => {
    const spend = Number(budget);
    if (!Number.isFinite(spend) || spend <= 0) return null;
    return Math.round(spend * 1_000_000);
  }, [budget]);

  const durationWeeks = useMemo(() => {
    if (duration.trim() === "") return null;
    const weeks = Number(duration);
    return Number.isFinite(weeks) ? weeks : NaN;
  }, [duration]);

  // Live preview, recomputed as the form changes. An unfinished form is not an error —
  // the preview simply waits, so nothing renders until quote() has a real answer.
  const preview = useMemo<Quote | null>(() => {
    if (spendMicros === null || Number.isNaN(durationWeeks)) return null;
    try {
      return quote({
        platforms,
        weekly_spend_micros: spendMicros,
        goal,
        duration_weeks: durationWeeks,
      });
    } catch {
      return null;
    }
  }, [platforms, spendMicros, goal, durationWeeks]);

  const togglePlatform = (value: string) =>
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !preview || !brandId) return;
    setMessage("");
    setPhase("submitting");

    try {
      const res = await fetch("/api/campaigns/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          platforms,
          weekly_spend_micros: spendMicros,
          goal,
          duration_weeks: durationWeeks,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not price this campaign.");
      }
      setResult(body.quote as Quote);
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  // ── the answer ────────────────────────────────────────────────────────────────
  // After a successful submit the quote IS the page: the number the server stored, not
  // the preview. The form comes back only if they ask for another brief.
  if (phase === "done" && result) {
    return (
      <div className="rounded-2xl border border-line bg-fill p-6">
        <p className={LABEL}>Your weekly price</p>
        <p className="mt-2 text-section tabular-nums text-ink">
          {dollars(result.weekly_price_micros)}
          <span className="text-body text-ink-3"> / week</span>
        </p>

        <dl className="mt-6 flex flex-col gap-2 border-t border-line pt-5">
          <div className="flex items-baseline justify-between gap-4 text-ui">
            <dt className="text-ink-2">
              Media across {result.platforms.length}{" "}
              {result.platforms.length === 1 ? "platform" : "platforms"}
            </dt>
            <dd className="tabular-nums text-ink">{dollars(result.weekly_spend_micros)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-ui">
            <dt className="text-ink-2">Our margin at {result.margin_pct}%</dt>
            <dd className="tabular-nums text-ink">{dollars(result.margin_micros)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2 text-ui font-medium">
            <dt className="text-ink">Total per week</dt>
            <dd className="tabular-nums text-ink">{dollars(result.weekly_price_micros)}</dd>
          </div>
        </dl>

        <p className="mt-5 text-body text-ink-2">Renews weekly until you pause it.</p>
        <p className="mt-2 max-w-[62ch] text-pretty text-meta text-ink-3">
          {result.billing_note}
        </p>

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setPhase("idle");
          }}
          className="mt-6 cursor-pointer rounded-xl border border-line-2 bg-paper px-5 py-[13px] text-ui font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
        >
          Price another campaign
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {brands.length > 1 ? (
        <label className="flex flex-col">
          <span className={LABEL}>Brand</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            disabled={busy}
            className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui text-ink outline-none transition-colors focus:border-ink disabled:opacity-60"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="flex flex-col">
          <span className={LABEL}>Brand</span>
          <p className="mt-2 rounded-xl border border-line bg-fill px-[15px] py-[13px] text-ui text-ink">
            {brands[0]?.name ?? ""}
          </p>
        </div>
      )}

      <fieldset className="flex flex-col">
        <legend className={LABEL}>Platforms</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {PLATFORM_OPTIONS.map((p) => (
            <label
              key={p.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-2 bg-paper px-4 py-3 text-ui text-ink transition-colors has-checked:border-ink"
            >
              <input
                type="checkbox"
                checked={platforms.includes(p.value)}
                onChange={() => togglePlatform(p.value)}
                disabled={busy}
                className="h-4 w-4 accent-ink"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col">
        <span className={LABEL}>Weekly media budget (USD)</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          disabled={busy}
          placeholder="500"
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui tabular-nums text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:opacity-60"
        />
        <span className="mt-1.5 text-meta text-ink-3">
          What the media itself should spend in a week, before our margin.
        </span>
      </label>

      <fieldset className="flex flex-col">
        <legend className={LABEL}>Goal</legend>
        <div className="mt-2 flex flex-col gap-3">
          {GOAL_OPTIONS.map((g) => (
            <label
              key={g.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-paper px-4 py-3 transition-colors has-checked:border-ink"
            >
              <input
                type="radio"
                name="goal"
                value={g.value}
                checked={goal === g.value}
                onChange={() => setGoal(g.value)}
                disabled={busy}
                className="mt-1 h-4 w-4 accent-ink"
              />
              <span>
                <span className="block text-ui text-ink">{g.label}</span>
                <span className="mt-0.5 block text-meta text-ink-3">{g.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col">
        <span className={LABEL}>Duration in weeks (optional)</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          disabled={busy}
          placeholder="Leave empty to run until paused"
          className="mt-2 rounded-xl border border-line-2 bg-paper px-[15px] py-[13px] text-ui tabular-nums text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:opacity-60"
        />
      </label>

      {preview ? (
        <div className="rounded-2xl border border-line bg-fill p-5">
          <p className={LABEL}>Live preview</p>
          <p className="mt-2 text-section tabular-nums text-ink">
            {dollars(preview.weekly_price_micros)}
            <span className="text-body text-ink-3"> / week</span>
          </p>
          <dl className="mt-4 flex flex-col gap-1.5 text-meta">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">
                Media across {preview.platforms.length}{" "}
                {preview.platforms.length === 1 ? "platform" : "platforms"}
              </dt>
              <dd className="tabular-nums text-ink">{dollars(preview.weekly_spend_micros)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Our margin at {preview.margin_pct}%</dt>
              <dd className="tabular-nums text-ink">{dollars(preview.margin_micros)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-meta text-ink-3">Renews weekly until you pause it.</p>
        </div>
      ) : null}

      {message ? (
        <div role="alert" className="text-meta text-error">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy || !preview || !brandId}
        className="cursor-pointer self-start rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Pricing…" : "Get my weekly price"}
      </button>
    </form>
  );
}
