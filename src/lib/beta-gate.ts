// beta-gate.ts — who may spend the box's CPU, and how much of it at once.
//
// THE PROBLEM THIS SOLVES. /api/generate/{run,create} and /api/edit/{run,create} each
// spawn a Python process that shells out to ffmpeg and, on a configured box, a TRIBE
// forward pass. They take minutes. They were unauthenticated and unlimited, which makes
// them a remote process-spawner: one loop over `fetch` fills the box's memory and disk
// with concurrent renders and nothing else on it survives.
//
// Note what this is NOT protecting. The /r, /g, /e status pages are capability URLs — a
// 128-bit share token IS the authorization, exactly as it is for a customer's result, and
// reading one costs a database round trip. Those stay open. Only the endpoints that start
// WORK are gated, because the cost asymmetry is the whole vulnerability: a request costs
// the caller nothing and costs us minutes of a machine.
//
// TWO SEPARATE CONTROLS, because they fail differently:
//
//   access       a shared secret. Stops strangers entirely.
//   slots        a concurrency cap and a per-caller daily quota. Stops US — a legitimate
//                tester with a loop, or an impatient double-click — from doing the same
//                damage a stranger would.
//
// DEFAULT CLOSED. With SOMA_BETA_TOKEN unset the betas answer 404 in production. An
// unset secret meaning "open to everyone" is how this class of endpoint gets left exposed,
// so the failure mode here is the safe one: forget to configure it and the betas are off,
// not public. Local development is exempt, because the whole point of the betas today is
// that Mukilan can run them on his own machine.
//
// 404 RATHER THAN 401, so a scan cannot tell the difference between "wrong secret" and
// "no such route". There is nothing to discover here.
//
// THE COUNTERS LIVE IN MEMORY, and that is a deliberate, bounded choice. They are
// per-process: they reset on restart and they do not coordinate across instances. On a
// serverless platform that would make the quota close to meaningless — but these routes
// cannot run there at all (no Python, no ffmpeg, no model), so the only place they ever
// execute is a single long-lived box, where one process's memory is the whole truth.
// If they ever move behind more than one process, this has to become a table.

import { timingSafeEqual } from "node:crypto";

const TOKEN_HEADER = "x-soma-beta";

// One at a time. These are not cheap requests being throttled for politeness — each is a
// video render or a model pass, and two in parallel on one box is slower than two in
// series plus a risk of running the machine out of memory mid-run.
const MAX_CONCURRENT = Number(process.env.SOMA_BETA_MAX_CONCURRENT || 1);

// Per caller per day. Generous enough for real use, small enough that a runaway script
// stops being interesting after a minute.
const MAX_PER_DAY = Number(process.env.SOMA_BETA_MAX_PER_DAY || 20);

const DAY_MS = 24 * 60 * 60 * 1000;

let inFlight = 0;
const seenToday = new Map<string, { count: number; resetAt: number }>();

function configuredToken(): string {
  return process.env.SOMA_BETA_TOKEN?.trim() ?? "";
}

/** Constant-time, and length-safe: timingSafeEqual throws on a length mismatch, which
 *  would itself leak the length through an exception. */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isLocal(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const host = new URL(request.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Best-effort caller identity for the daily quota. Spoofable via X-Forwarded-For, which
 *  is fine: the secret is what keeps strangers out, and this only has to stop one honest
 *  caller from looping. */
export function callerKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "local";
}

const notFound = () =>
  Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Returns a Response to send when the caller may NOT run a beta, or null when they may.
 */
export function betaAccessDenied(request: Request): Response | null {
  const secret = configuredToken();

  if (!secret) {
    // Unconfigured: usable from a developer machine, invisible in production.
    return isLocal(request) ? null : notFound();
  }

  const presented =
    request.headers.get(TOKEN_HEADER)?.trim() ||
    new URL(request.url).searchParams.get("k")?.trim() ||
    "";

  if (!presented || !secretsMatch(presented, secret)) return notFound();
  return null;
}

export type RunSlot = { release: () => void };

/**
 * Take one of the box's run slots, or explain why not.
 *
 * The caller MUST release in a `finally` — a slot leaked by an early return closes the
 * beta for everyone until the process restarts, which is a worse outage than the one this
 * function exists to prevent.
 */
export function acquireRunSlot(request: Request): RunSlot | Response {
  const now = Date.now();
  const key = callerKey(request);

  const seen = seenToday.get(key);
  if (!seen || seen.resetAt <= now) {
    seenToday.set(key, { count: 0, resetAt: now + DAY_MS });
  }
  const bucket = seenToday.get(key)!;

  if (bucket.count >= MAX_PER_DAY) {
    return Response.json(
      {
        error: `That is ${MAX_PER_DAY} beta runs today, which is the daily cap. Each one is a real render on a real machine, so the limit is there to keep the box responsive rather than to ration anything.`,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
        },
      },
    );
  }

  if (inFlight >= MAX_CONCURRENT) {
    return Response.json(
      {
        error:
          "A beta run is already going. These take minutes and run one at a time, because two at once on one box is slower than two in a row.",
      },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }

  inFlight += 1;
  bucket.count += 1;

  let released = false;
  return {
    release() {
      // Idempotent: a double release would hand out a slot that was never taken, and the
      // cap would drift upward every time it happened.
      if (released) return;
      released = true;
      inFlight = Math.max(0, inFlight - 1);
    },
  };
}

/** Test seam. Never called by route code. */
export function __resetBetaGate(): void {
  inFlight = 0;
  seenToday.clear();
}
