// Smoke check for the site routes the loop is allowed to touch.
//
// Thresholds below are baselined from a known-good production build (see the
// `observed` note on each route) and set ~25% under it. They are a floor, not a
// spec: they catch a page that went blank, lost its canvases, or started
// throwing — not cosmetic change. Raise them when a route gets substantially
// bigger; never lower them to make a red run go green.
//
// Usage: node scripts/smoke.mjs          (expects a server on SMOKE_URL)
//        SMOKE_URL=http://localhost:3099 node scripts/smoke.mjs

import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:3099';

const ROUTES = [
  // observed: text 240, canvas 1, scroll 900
  { path: '/', minText: 150, minCanvas: 1, minScroll: 600, needsH1: true },
  // observed: text 7282, canvas 8, scroll 8783 — up from 4729/7/6220 when the
  // comprehension beat was restored to this route (it renders ComprehensionPanel and
  // MessageTrack, which the batch chart above it cannot supply). The short cut moved
  // onto /demo, so these are its numbers, not the retired long page's.
  { path: '/demo', minText: 5400, minCanvas: 6, minScroll: 6500, needsH1: true },
  // observed: text 3579, canvas 4, scroll 4098
  { path: '/preflight', minText: 2500, minCanvas: 3, minScroll: 3200, needsH1: true },
  // The batch intake. observed: text 2148, canvas 0, scroll 2301. No canvas on this
  // route by design — it is a form, and asserting a floor of 0 documents that rather
  // than leaving the next person to wonder whether one went missing.
  { path: '/upload', minText: 1600, minCanvas: 0, minScroll: 1700, needsH1: true },
  // A well-formed token that cannot exist MUST 404, and this is the assertion that keeps
  // the capability-URL model honest: /r/<token> has no login in front of it, so the only
  // thing standing between a stranger and a customer's unreleased creative is that an
  // unknown token is indistinguishable from a malformed one. If this ever returns 200 —
  // a loosened guard, a debug branch, an error page rendering a row — the gate stops the
  // build. 32 zeros is shape-valid (isShareToken passes) and vanishingly unlikely to be
  // minted, so this exercises the lookup rather than the regex.
  { path: '/r/' + '0'.repeat(32), expectStatus: 404 },
  // ...and a malformed one, which must be refused before it reaches a query at all.
  { path: '/r/not-a-token', expectStatus: 404 },
];

// A cancelled media preload is normal browser behaviour, not a defect.
const MEDIA = /\.(mp4|webm|mov|m4s|ogg)(\?|$)/i;
const isBenignFailure = (url, err) => MEDIA.test(url) && /ERR_ABORTED/.test(err || '');

const failures = [];

let browser = await chromium.launch();

// A browser that dies mid-run (resource contention, an OOM, a concurrent build
// eating the machine) is an environment failure, not a defect in the site.
// Retrying once on a fresh browser keeps the loop from rolling back good work
// for a reason that has nothing to do with the change under test.
const TRANSIENT = /has been closed|Target closed|browserContext|Protocol error|crashed/i;

async function checkRoute(route) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const badRequests = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    if (!isBenignFailure(r.url(), err)) badRequests.push(`${r.url().slice(0, 120)} :: ${err}`);
  });

  const problems = [];
  let info = null;

  try {
    const resp = await page.goto(BASE + route.path, { waitUntil: 'networkidle', timeout: 45000 });
    const status = resp?.status();
    const want = route.expectStatus ?? 200;
    if (status !== want) problems.push(`status ${status} (want ${want})`);

    // A route asserted to be a non-200 has nothing else worth measuring: it renders the
    // not-found page, whose text and height are Next's, not ours. Checking the status IS
    // the check, so return before the content floors run.
    if (want !== 200) {
      try {
        await ctx.close();
      } catch {
        /* already gone */
      }
      return { problems, info: { textLen: 0, canvases: 0, scrollH: 0, status } };
    }

    // let fonts, webgl and the opening animation settle
    await page.waitForTimeout(3000);

    info = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        textLen: (document.body.innerText || '').length,
        canvases: document.querySelectorAll('canvas').length,
        scrollH: main?.scrollHeight ?? document.body.scrollHeight ?? 0,
      };
    });

    if (route.needsH1 && !info.h1) problems.push('no <h1> rendered');
    if (!info.title) problems.push('empty document title');
    if (info.textLen < route.minText) problems.push(`text ${info.textLen} < ${route.minText}`);
    if (info.canvases < route.minCanvas) problems.push(`canvas ${info.canvases} < ${route.minCanvas}`);
    if (info.scrollH < route.minScroll) problems.push(`scrollHeight ${info.scrollH} < ${route.minScroll}`);
  } catch (e) {
    problems.push(`navigation threw: ${String(e).slice(0, 200)}`);
  }

  if (pageErrors.length) problems.push(`${pageErrors.length} uncaught page error(s): ${pageErrors[0]}`);
  if (consoleErrors.length) problems.push(`${consoleErrors.length} console error(s): ${consoleErrors[0]}`);
  if (badRequests.length) problems.push(`${badRequests.length} failed request(s): ${badRequests[0]}`);

  // Never let teardown throw — a dead browser here used to crash node with an
  // uncaught exception before the summary printed, taking the remaining routes
  // with it and surfacing a stack trace instead of a verdict.
  try {
    await ctx.close();
  } catch {
    /* browser already gone; the problems list already records why */
  }

  return { problems, info };
}

for (const route of ROUTES) {
  let { problems, info } = await checkRoute(route);

  if (problems.length && problems.some((p) => TRANSIENT.test(p))) {
    console.log(`retry ${route.path} (transient: ${problems.find((p) => TRANSIENT.test(p))?.slice(0, 80)})`);
    try {
      await browser.close();
    } catch {
      /* already dead */
    }
    browser = await chromium.launch();
    ({ problems, info } = await checkRoute(route));
  }

  if (problems.length) {
    failures.push({ route: route.path, problems });
    console.log(`FAIL ${route.path}`);
    for (const p of problems) console.log(`       - ${p}`);
  } else {
    console.log(
      `ok   ${route.path.padEnd(13)} text=${info.textLen} canvas=${info.canvases} scroll=${info.scrollH}`,
    );
  }
}

try {
  await browser.close();
} catch {
  /* nothing to clean up */
}

// ── the beta gate ─────────────────────────────────────────────────────────────
//
// /api/{generate,edit}/{run,create} each spawn a Python process that runs for minutes.
// Unguarded they are a remote process-spawner, so the thing worth asserting is not that
// they work — on this machine they cannot — but that a caller without the secret cannot
// reach the part that spends CPU.
//
// Only meaningful when SOMA_BETA_TOKEN is set: unset, the gate deliberately allows
// localhost so the betas stay usable in development, and there would be nothing to test.
// The run is SKIPPED rather than passed in that case, because a check that silently
// tests nothing is worse than no check.

const BETA_ROUTES = [
  '/api/generate/run',
  '/api/generate/create',
  '/api/edit/run',
  '/api/edit/create',
];

const betaSecret = process.env.SOMA_BETA_TOKEN?.trim();
let betaChecked = 0;

if (!betaSecret) {
  console.log('\nskip beta gate — set SOMA_BETA_TOKEN on the server to exercise it');
} else {
  console.log('');
  for (const path of BETA_ROUTES) {
    const post = (headers) =>
      fetch(BASE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: '{}',
      });

    // No secret, and a wrong one, must be indistinguishable from "no such route".
    for (const [label, headers] of [
      ['no secret', {}],
      ['wrong secret', { 'x-soma-beta': `${betaSecret}-wrong` }],
    ]) {
      const res = await post(headers);
      if (res.status !== 404) {
        failures.push({ route: path, problems: [`${label}: expected 404, got ${res.status}`] });
        console.log(`FAIL ${path} (${label}) -> ${res.status}`);
      } else {
        betaChecked += 1;
      }
    }

    // The right secret must get PAST the gate. It will still fail further in (no model on
    // this machine) — anything other than 404 proves the gate opened, which is the claim.
    const res = await post({ 'x-soma-beta': betaSecret });
    if (res.status === 404) {
      failures.push({ route: path, problems: ['correct secret was refused with 404'] });
      console.log(`FAIL ${path} (correct secret) -> 404`);
    } else {
      betaChecked += 1;
      console.log(`ok   ${path.padEnd(24)} gate closed to strangers, open with the secret`);
    }
  }
}

if (failures.length) {
  console.log(`\nsmoke: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(
  `\nsmoke: all ${ROUTES.length} routes ok` +
    (betaChecked ? `, ${betaChecked} beta-gate assertions ok` : ''),
);
