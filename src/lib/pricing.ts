// pricing.ts — the TS mirror of tools/serve/pricing.py, which is CANONICAL.
//
// The onboarding flow computes a quote at request time, and spawning Python for
// arithmetic would be absurd — so the math lives twice, and the only reason that is
// tolerable is scripts/check-pricing-parity.mts: verify recomputes the committed corpus
// (tools/serve/fixtures/pricing_cases.json) through this file and fails on any drift.
// Change constants or math here AND in pricing.py, regenerate the corpus, same commit.
//
// Integer discipline matches the Python side exactly: the platform split hands out
// whole micros with a deterministic remainder, and the margin is ceil'd in BigInt so
// weekly_price = spend + margin holds to the micro — migration 0016 re-checks that
// identity on insert, so a float here would eventually be a 500 there.

export const MARGIN_PCT_DEFAULT = 20;
export const MARGIN_PCT_MAX = 50;
export const PLATFORMS = ["meta", "tiktok"] as const;

export type Platform = (typeof PLATFORMS)[number];
export type Goal = "aggressive_conversions" | "low_cost_testing";

export const PLAYBOOKS: Record<Goal, Record<string, unknown>> = {
  aggressive_conversions: {
    optimization_goal: "CONVERSIONS",
    billing_event: "IMPRESSIONS",
    holdout_pct: 0.0,
    arms: 2,
  },
  low_cost_testing: {
    optimization_goal: "CLICK",
    billing_event: "CPC",
    holdout_pct: 0.1,
    arms: 3,
  },
};

export const BILLING_NOTE =
  "quote, not an invoice: activation of billing is gated on PLAN.md gate 4 " +
  "(tools/serve/check_licence_gate.py)";

export type QuoteSpec = {
  platforms: string[];
  weekly_spend_micros: number;
  goal: string;
  margin_pct?: number;
  currency?: string;
  duration_weeks?: number | null;
};

export type Quote = {
  currency: string;
  goal: Goal;
  playbook: Record<string, unknown>;
  platforms: { platform: string; weekly_spend_micros: number }[];
  weekly_spend_micros: number;
  margin_pct: number;
  margin_micros: number;
  weekly_price_micros: number;
  duration_weeks: number | null;
  renews: "weekly_until_paused";
  billing_note: string;
};

export function quote(spec: QuoteSpec): Quote {
  const platforms = spec.platforms ?? [];
  const spend = Math.trunc(spec.weekly_spend_micros ?? 0);
  const goal = spec.goal ?? "";
  const marginPct = spec.margin_pct ?? MARGIN_PCT_DEFAULT;
  const currency = (spec.currency ?? "USD").toUpperCase();
  const durationWeeks = spec.duration_weeks ?? null;

  if (platforms.length === 0) throw new Error("pick at least one platform");
  if (new Set(platforms).size !== platforms.length) throw new Error("duplicate platform in brief");
  const unknown = platforms.filter((p) => !(PLATFORMS as readonly string[]).includes(p));
  if (unknown.length > 0)
    throw new Error(`unknown platform(s) ${JSON.stringify(unknown)}; have ${JSON.stringify([...PLATFORMS])}`);
  if (spend <= 0) throw new Error("weekly_spend_micros must be positive");
  if (!(goal in PLAYBOOKS)) throw new Error(`unknown goal ${JSON.stringify(goal)}`);
  if (!(marginPct >= 0 && marginPct <= MARGIN_PCT_MAX))
    throw new Error(`margin_pct must be in [0, ${MARGIN_PCT_MAX}]`);
  if (durationWeeks !== null && Math.trunc(durationWeeks) < 1)
    throw new Error("duration_weeks must be at least 1 when given");

  // Even split in platform order, remainder one micro at a time — floats never touch
  // an allocated amount. Identical discipline to the Python side.
  const base = Math.floor(spend / platforms.length);
  const split = platforms.map(() => base);
  const remainder = spend - base * platforms.length;
  for (let i = 0; i < remainder; i += 1) split[i] += 1;

  // trunc(marginPct * 100) matches Python's int(margin_pct * 100): basis-point
  // granularity, truncated the same way on both sides. BigInt() calls, not n-literals:
  // tsconfig targets ES2017, where the literal syntax is a TS2737 even though the
  // runtime BigInt is fine.
  const bp = BigInt(Math.trunc(marginPct * 100));
  const marginMicros = Number((BigInt(spend) * bp + BigInt(9_999)) / BigInt(10_000));

  return {
    currency,
    goal: goal as Goal,
    playbook: PLAYBOOKS[goal as Goal],
    platforms: platforms.map((p, i) => ({ platform: p, weekly_spend_micros: split[i] })),
    weekly_spend_micros: spend,
    margin_pct: marginPct,
    margin_micros: marginMicros,
    weekly_price_micros: spend + marginMicros,
    duration_weeks: durationWeeks === null ? null : Math.trunc(durationWeeks),
    renews: "weekly_until_paused",
    billing_note: BILLING_NOTE,
  };
}
