import { promises as fs } from "fs";
import path from "path";

// Shape of ad_backtest.json (published by the pipeline's publish_results.py --ad-backtest).
// Every field is optional/nullable — the file may be absent (no run yet) or partial.
export type AdBacktest = {
  signal?: boolean;
  n_ads?: number | null;
  score?: string;
  partial_r?: number | null;
  perm_p?: number | null;
  raw_r?: number | null;
  verdict?: string;
  tag?: string;
};

// Read at REQUEST time (the page is force-dynamic), never cached. Returns null when the
// file is missing so the caller can render the honest "pending" state instead of green.
export async function readAdBacktest(): Promise<AdBacktest | null> {
  try {
    const file = path.join(process.cwd(), "public", "ad_backtest.json");
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    return data as AdBacktest;
  } catch {
    return null;
  }
}

// Evidence tier the ad-backtest block wears. Deliberately NO "validated"/green branch:
// a cross-sectional ad backtest can be pending, an early amber signal, or a red null —
// it can never turn this claim green. Green is reserved for the encoder alone.
export type AdBacktestView = {
  tier: "validating" | "hypothesis" | "neutral";
  badge: string;
  result: string;
};

export function viewAdBacktest(d: AdBacktest | null): AdBacktestView {
  if (!d) {
    return {
      tier: "neutral",
      badge: "cross-sectional · not yet run",
      result: "Result: pending the first real-ad run.",
    };
  }

  const n = d.n_ads == null ? "?" : String(d.n_ads);
  const pr = d.partial_r == null ? "?" : d.partial_r.toFixed(2);
  const pp = d.perm_p == null ? "?" : d.perm_p.toFixed(3);
  const score = d.score || "neural";

  if (d.signal) {
    return {
      tier: "validating",
      badge: `cross-sectional · early signal · n=${n}`,
      result:
        `Result (n=${n} ads): the ${score} score ranks real ads over the ` +
        `loudness/cuts/length baseline — partial r ≈ ${pr}, p = ${pp}. Early, proxy ` +
        `outcome, out-of-distribution — a hypothesis, not a validated engagement model.`,
    };
  }

  return {
    tier: "hypothesis",
    badge: `cross-sectional · null · n=${n}`,
    result:
      `Result (n=${n} ads): NULL — the ${score} score does not beat the ` +
      `loudness/cuts/length baseline (partial r ≈ ${pr}, p = ${pp}). Reported plainly; ` +
      `the claim waits.`,
  };
}
