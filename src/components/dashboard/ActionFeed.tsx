"use client";

// ActionFeed — the planned actions of one cycle report, with advisory approve/reject.
//
// THE FEED SHOWS THREE THINGS AND TREATS THEM DIFFERENTLY. Planned actions (pauses) and
// activation referrals get Approve / Reject buttons; a decided action shows its decision
// and nothing clickable. Refusals get neither: they render read-only, muted, with the
// exact refusal text the autopilot wrote — refusals are load-bearing honesty, and a
// dashboard that softened or hid them would be lying by omission.
//
// A DECISION HERE MOVES NO MONEY. The POST writes one row into serve_action_approvals
// and that is the entire effect. The sentence rendered above the rows says so in as many
// words, because a button labelled "Approve" next to a pause action would otherwise read
// as a remote control.
//
// The server page derives each action's stable key from the report payload
// (action:platform:external_ad_id); the unique index on (report_id, action_key) turns a
// second decision into a 409, which renders as the conflict message rather than a retry.

import { useState } from "react";

export type FeedAction = {
  /** Stable key within the report — what serve_action_approvals records. */
  key: string;
  action: string;
  platform: string | null;
  externalAdId: string | null;
  reason: string;
};

export type FeedRefusal = {
  stage: string;
  refused: string;
};

export default function ActionFeed({
  reportId,
  actions,
  refusals,
  decided,
}: {
  reportId: string;
  actions: FeedAction[];
  refusals: FeedRefusal[];
  /** action key -> decision, from rows already in serve_action_approvals. */
  decided: Record<string, string>;
}) {
  const [decisions, setDecisions] = useState<Record<string, string>>(decided);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const decide = async (key: string, decision: "approved" | "rejected") => {
    if (busyKey) return;
    setBusyKey(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch("/api/serve/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, actionKey: key, decision }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? "Could not record this decision.");
      }
      const recorded =
        typeof body.approval?.decision === "string" ? body.approval.decision : decision;
      setDecisions((prev) => ({ ...prev, [key]: recorded }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Something went wrong.",
      }));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <article className="rounded-2xl border border-line bg-fill p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-ui font-medium text-ink">Planned actions</h3>
          <span className="text-meta text-ink-3">
            {actions.length} {actions.length === 1 ? "action" : "actions"}
          </span>
        </div>

        <p className="mt-3 max-w-[62ch] text-pretty text-meta text-ink-3">
          Approvals recorded here are advisory artifacts; execution happens through the operator CLI (launch.py / autopilot), never from this page.
        </p>

        {actions.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {actions.map((a) => {
              const decision = decisions[a.key];
              const busy = busyKey === a.key;
              return (
                <li key={a.key} className="flex flex-col gap-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="text-ui text-ink">
                      <span className="uppercase tracking-[0.08em]">{a.action}</span>
                      {" · "}
                      {a.platform ?? "—"}
                      {" · "}
                      <span className="tabular-nums">{a.externalAdId ?? "no external ad id"}</span>
                    </span>

                    {decision ? (
                      <span className="shrink-0 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-ink-2">
                        {decision}
                      </span>
                    ) : (
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide(a.key, "approved")}
                          className="cursor-pointer rounded-xl bg-ink px-3.5 py-[7px] text-meta font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? "Recording…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide(a.key, "rejected")}
                          className="cursor-pointer rounded-xl border border-line-2 bg-paper px-3.5 py-[7px] text-meta font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </div>

                  <p className="max-w-[66ch] text-pretty text-meta text-ink-2">{a.reason}</p>

                  {errors[a.key] ? (
                    <p role="alert" className="text-meta text-error">
                      {errors[a.key]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 max-w-[56ch] text-pretty text-body text-ink-2">
            This cycle planned no actions — nothing lost an experiment, and no spend ran
            up against a cap.
          </p>
        )}
      </article>

      <article className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-ui font-medium text-ink-2">Refusals</h3>
          <span className="text-meta text-ink-3">
            {refusals.length} {refusals.length === 1 ? "refusal" : "refusals"}
          </span>
        </div>

        {refusals.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {refusals.map((r, i) => (
              <li key={`${r.stage}-${i}`} className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  {r.stage}
                </span>
                <p className="max-w-[70ch] text-pretty text-meta text-ink-3">{r.refused}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-[56ch] text-pretty text-meta text-ink-3">
            The autopilot refused nothing this cycle. When it does refuse — a gate, a bad
            fixture, a stage it would not run — the exact refusal text appears here.
          </p>
        )}
      </article>
    </div>
  );
}
