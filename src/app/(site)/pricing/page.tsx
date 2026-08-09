import type { Metadata } from "next";
import Link from "next/link";

// /pricing — the weekly price, in public.
//
// EVERY NUMBER ON THIS PAGE IS COMPUTED, never typed. The grid below calls
// recommendSpend() and quote() from src/lib/pricing.ts at render, so the page moves in
// lockstep with the canonical engine (tools/serve/pricing.py) and the parity gate keeps
// both languages honest. Hardcoding a dollar figure here would be the one way this page
// could lie.
//
// COPY DISCIPLINE. Same rule as /audit: no performance claims, no partner counts, no
// accuracy figures. Pricing is the one thing this page is allowed to be precise about.
// The billing boundary is stated in public voice rather than by printing BILLING_NOTE,
// which names internal artifacts.

import {
  MARGIN_PCT_DEFAULT,
  PLATFORM_EXTRA_BP,
  REACH,
  quote,
  recommendSpend,
  type Goal,
  type Reach,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "soma — pricing: one weekly price, everything included",
  description:
    "One weekly price that bundles the media and our margin. Pause any time. No per-asset fees, no platform fee, no markup hidden inside the media.",
};

const GOALS: { goal: Goal; label: string; blurb: string }[] = [
  {
    goal: "low_cost_testing",
    label: "Low-cost testing",
    blurb: "Find the cut worth backing before spending like it matters.",
  },
  {
    goal: "aggressive_conversions",
    label: "Aggressive conversions",
    blurb: "Put real media behind the cut you already believe in.",
  },
];

const REACH_LABELS: Record<Reach, string> = {
  local: "Local",
  national: "National",
  broad: "Broad",
};

function dollars(micros: number): string {
  const major = micros / 1e6;
  return Number.isInteger(major)
    ? `$${major.toLocaleString("en-US")}`
    : `$${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-ink-3">
      {children}
    </div>
  );
}

export default function PricingPage() {
  // goal × reach, single network, open-ended duration — the recommendation a brief with
  // no overrides would get. The dashboard brief form re-prices to the actual brief.
  const grid = GOALS.map(({ goal, label, blurb }) => ({
    goal,
    label,
    blurb,
    tiers: REACH.map((reach) => {
      const rec = recommendSpend({
        platforms: ["meta"],
        goal,
        reach,
        duration_weeks: null,
      });
      const q = quote({
        platforms: ["meta"],
        weekly_spend_micros: rec.weekly_spend_micros,
        goal,
        duration_weeks: null,
      });
      return { reach, q };
    }),
  }));

  return (
    <article>
      {/* header */}
      <header className="mx-auto max-w-[920px] px-[clamp(16px,4vw,24px)] pb-8 pt-[clamp(26px,5vw,44px)]">
        <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
          <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
          Pricing
        </div>
        <h1 className="max-w-[18ch] text-balance text-hero text-ink">
          One weekly <span className="font-serif font-normal italic">price</span>.
        </h1>
        <p className="mt-[18px] max-w-[60ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
          Everything included, pause any time. The price bundles the media and our margin
          into a single number that renews weekly until you stop it — no line items
          arriving later.
        </p>
      </header>

      {/* 01 — the numbers */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>01 · what a week costs</Eyebrow>
        <h2 className="max-w-[24ch] text-balance text-section text-ink">
          Two goals, three sizes of audience.
        </h2>
        <p className="mt-4 max-w-[60ch] text-pretty text-body text-ink-2">
          These are the recommended starting points on a single network, open-ended. Your
          own quote is priced to your brief in the studio — same engine, your numbers.
        </p>

        <div className="mt-8 flex flex-col gap-10">
          {grid.map(({ goal, label, blurb, tiers }) => (
            <div key={goal}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-ui font-medium text-ink">{label}</h3>
                <p className="text-meta text-ink-3">{blurb}</p>
              </div>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[14px]">
                {tiers.map(({ reach, q }) => (
                  <article key={reach} className="rounded-2xl border border-line bg-fill p-5">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                      {REACH_LABELS[reach]}
                    </div>
                    <div className="mt-2 text-section tabular-nums text-ink">
                      {dollars(q.weekly_price_micros)}
                      <span className="text-body text-ink-3"> / week</span>
                    </div>
                    <div className="mt-3 border-t border-line pt-3 text-meta text-ink-3">
                      <span className="tabular-nums">{dollars(q.weekly_spend_micros)}</span>{" "}
                      media +{" "}
                      <span className="tabular-nums">{dollars(q.margin_micros)}</span>{" "}
                      margin
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 02 — where the money goes */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>02 · where the money goes</Eyebrow>
        <h2 className="max-w-[24ch] text-balance text-section text-ink">
          The media is the media.
        </h2>
        <p className="mt-4 max-w-[60ch] text-pretty text-body text-ink-2">
          On top of the media we add {MARGIN_PCT_DEFAULT}%, and that is the only thing we
          add. No per-asset fees, no platform fee, no markup hidden inside the media
          number — the split is printed on every quote, to the cent.
        </p>
        <p className="mt-4 max-w-[60ch] text-pretty text-body text-ink-2">
          Two networks today: Meta and TikTok. Running both raises the recommended media
          by {PLATFORM_EXTRA_BP}%, because two auctions need real budget each — the
          margin rate stays the same.
        </p>
      </section>

      {/* 03 — the boundary */}
      <section className="mx-auto max-w-[920px] border-t border-line px-[clamp(16px,4vw,24px)] py-[clamp(30px,5vw,52px)]">
        <Eyebrow>03 · before you are charged</Eyebrow>
        <h2 className="max-w-[26ch] text-balance text-section text-ink">
          A price is a quote, not an invoice.
        </h2>
        <p className="mt-4 max-w-[60ch] text-pretty text-body text-ink-2">
          We are not taking payment while platform access approvals are in flight, and we
          will tell you before that changes. Accepting a quote records your yes at that
          price — nothing is charged and nothing goes live until access clears.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-5">
          {/* prefetch={false}: /sign-up is in src/proxy.ts's matcher, so a viewport
              prefetch fires an auth round-trip and surfaces as an aborted request. */}
          <Link
            href="/sign-up"
            prefetch={false}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-[13px] text-ui font-medium text-paper transition-colors hover:bg-ink/85"
          >
            Create an account
          </Link>
          <Link
            href="/demo"
            className="text-ui text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
          >
            See the demo first
          </Link>
        </div>
      </section>
    </article>
  );
}
