// /dashboard/serve/actions — the newest cycle report, rendered as a decision feed.
//
// The autopilot writes one cycle report per run (tools/serve/autopilot.py); a
// service-role process lands it in serve_reports and this page shows the latest one the
// signed-in user's brands can see. Three payload fields matter here: actions_planned
// (pauses the cycle decided on), activation_referrals (winners referred to launch.py,
// because autopilot never starts spend), and refusals (what the cycle declined to do,
// verbatim). The first two take advisory approve/reject; refusals render untouched.
//
// KEYS ARE DERIVED, NOT STORED. The payload is the operator artifact and carries no ids
// for its actions, so the key each approval hangs on is built deterministically from the
// action's own fields (action:platform:external_ad_id, index-suffixed on collision). The
// payload is frozen at write time, so the derivation is stable for the life of the
// report.

import {
  listBrandsForUser,
  loadLatestCycleReport,
} from "@/lib/serve";
import ActionFeed, {
  type FeedAction,
  type FeedRefusal,
} from "@/components/dashboard/ActionFeed";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** action:platform:external_ad_id, with an index suffix only when two rows would
 *  otherwise collide — the stored action_key must be unique per report. */
function keyFor(
  action: string,
  platform: string | null,
  externalAdId: string | null,
  taken: Set<string>,
): string {
  const base = `${action}:${platform ?? "unknown"}:${externalAdId ?? "none"}`;
  let key = base;
  let n = 1;
  while (taken.has(key)) {
    key = `${base}:${n}`;
    n += 1;
  }
  taken.add(key);
  return key;
}

/** The payload arrives as unknown JSON; everything narrows here so the client component
 *  receives plain typed rows and renders no surprises. */
function feedFrom(payload: Record<string, unknown>): {
  actions: FeedAction[];
  refusals: FeedRefusal[];
} {
  const taken = new Set<string>();
  const actions: FeedAction[] = [];

  const planned = Array.isArray(payload.actions_planned) ? payload.actions_planned : [];
  for (const entry of planned) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const action = text(row.action) ?? "pause";
    const platform = text(row.platform);
    const externalAdId = text(row.external_ad_id);
    actions.push({
      key: keyFor(action, platform, externalAdId, taken),
      action,
      platform,
      externalAdId,
      reason: text(row.reason) ?? "no reason recorded",
    });
  }

  const referrals = Array.isArray(payload.activation_referrals)
    ? payload.activation_referrals
    : [];
  for (const entry of referrals) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const action = text(row.action) ?? "activate";
    const platform = text(row.platform);
    const externalAdId = text(row.external_ad_id);
    const referredTo = text(row.referred_to);
    const byDesign = text(row.refused_by_design);
    const armKey = text(row.arm_key);
    const parts = [
      armKey ? `winner ${armKey}` : null,
      referredTo ? `referred to ${referredTo}` : null,
      byDesign,
    ].filter((p): p is string => p !== null);
    actions.push({
      key: keyFor(action, platform, externalAdId, taken),
      action,
      platform,
      externalAdId,
      reason: parts.length > 0 ? parts.join(" — ") : "activation referral",
    });
  }

  const refusals: FeedRefusal[] = [];
  const rawRefusals = Array.isArray(payload.refusals) ? payload.refusals : [];
  for (const entry of rawRefusals) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    refusals.push({
      stage: text(row.stage) ?? "cycle",
      refused: text(row.refused) ?? "refused, with no text recorded",
    });
  }

  return { actions, refusals };
}

export default async function ServeActionsPage() {
  const brands = await listBrandsForUser();
  const latest = await loadLatestCycleReport(brands.map((b) => b.id));

  return (
    <div className="mx-auto max-w-[860px] px-[clamp(18px,5vw,32px)] pb-24 pt-[clamp(28px,5vw,44px)]">
      <h1 className="text-balance text-hero text-ink">
        What the last cycle <span className="font-serif font-normal italic">decided</span>.
      </h1>
      <p className="mt-4 max-w-[58ch] text-pretty text-body text-ink-2">
        Every autopilot run writes one report: the pauses it planned, the winners it
        referred to launch, and what it refused to do. Your approvals are recorded next
        to the report as advisory artifacts — nothing on this page executes anything.
      </p>

      {latest ? (
        <>
          <p className="mt-8 text-[11px] uppercase tracking-[0.12em] text-ink-3">
            {latest.report.periodLabel ?? "Latest cycle"} · {when(latest.report.createdAt)}
          </p>
          <div className="mt-4">
            <ActionFeed
              reportId={latest.report.id}
              {...feedFrom(latest.report.payload)}
              decided={Object.fromEntries(
                latest.approvals.map((a) => [a.actionKey, a.decision] as const),
              )}
            />
          </div>
        </>
      ) : (
        <div className="mt-11 rounded-2xl border border-line bg-fill p-6">
          <h2 className="text-section text-ink">
            No cycle report yet — autopilot runs write reports here.
          </h2>
          <p className="mt-3 max-w-[54ch] text-pretty text-body text-ink-2">
            When an operator runs a Serve cycle for one of your brands, its report lands
            on this page: planned pauses, activation referrals, and every refusal,
            verbatim.
          </p>
        </div>
      )}
    </div>
  );
}
