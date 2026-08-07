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
  // The account surfaces. observed: sign-in text 267, sign-up text 319, both scroll 900.
  { path: '/sign-in', minText: 200, minCanvas: 0, minScroll: 650, needsH1: true },
  { path: '/sign-up', minText: 240, minCanvas: 0, minScroll: 650, needsH1: true },
  // Studio is behind a session. These two assert the BOUNDARY, which is the half of the
  // dashboard a smoke run can check without credentials — and the half that fails
  // catastrophically: a Studio route that 500s or renders for a stranger is worse than one
  // that looks wrong. src/proxy.ts redirects optimistically and requireUser() is the real
  // check, so both must land on /sign-in for a visitor with no cookie.
  { path: '/dashboard', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/brands', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/serve', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/runs/' + '0'.repeat(32), expectRedirectTo: '/sign-in' },
  // The recorded pipeline run. Its content comes from src/data/run-capture.json, so the
  // text floor is really an assertion that the capture is still wired in: an empty or
  // truncated capture renders a page with headings and no stages, which is exactly the
  // failure a floor catches. The number stays modest on purpose — a longer run has more
  // stages and more log, so this must not encode the size of one particular capture.
  { path: '/run', minText: 1200, minCanvas: 0, minScroll: 1400, needsH1: true },
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

    // A guarded route is asserted by WHERE IT LANDS, not by its status: the browser
    // follows the redirect, so the response here is the sign-in page's 200. Checking the
    // destination is the check — a regression that stopped guarding Studio would land on
    // /dashboard with a 200 and pass every other assertion in this file.
    if (route.expectRedirectTo) {
      const landed = new URL(page.url()).pathname;
      if (landed !== route.expectRedirectTo) {
        problems.push(`landed on ${landed} (want ${route.expectRedirectTo})`);
      }
      try {
        await ctx.close();
      } catch {
        /* already gone */
      }
      return { problems, info: { textLen: 0, canvases: 0, scrollH: 0, landed } };
    }

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

// ── Studio, signed in ─────────────────────────────────────────────────────────
//
// The routes above prove Studio is GUARDED. They cannot prove it RENDERS, because
// everything past the guard needs a session — and that is where ~2,500 lines of dashboard,
// run report and edit workbench live, none of it otherwise exercised by this gate.
//
// Credentials come from the environment and are never written down here. Unset, this is
// SKIPPED rather than passed, for the same reason the beta gate is: a check that silently
// tests nothing is worse than no check.
//
//   SOMA_SMOKE_EMAIL=... SOMA_SMOKE_PASSWORD=... node scripts/smoke.mjs
//
// Use a throwaway account with seeded data, not a real customer's.

const smokeEmail = process.env.SOMA_SMOKE_EMAIL?.trim();
const smokePassword = process.env.SOMA_SMOKE_PASSWORD;
let studioChecked = 0;

if (!smokeEmail || !smokePassword) {
  console.log('\nskip Studio (signed in) — set SOMA_SMOKE_EMAIL and SOMA_SMOKE_PASSWORD');
} else {
  console.log('');
  const authBrowser = await chromium.launch();
  const ctx = await authBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

  try {
    await page.goto(BASE + '/sign-in', { waitUntil: 'networkidle', timeout: 45000 });
    await page.locator('input[type="email"]').fill(smokeEmail);
    await page.locator('input[type="password"]').fill(smokePassword);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 45000 }),
      page.locator('button[type="submit"]').click(),
    ]);

    const landed = new URL(page.url()).pathname;
    if (landed !== '/dashboard') {
      failures.push({ route: '/sign-in', problems: [`sign-in landed on ${landed}, want /dashboard`] });
      console.log(`FAIL /sign-in -> ${landed} (credentials wrong, or the redirect broke)`);
    } else {
      studioChecked += 1;

      // The library. A signed-in dashboard that renders its chrome and no rows is the
      // failure this catches: text well under the floor means the grid came back empty.
      await page.waitForTimeout(2000);
      const lib = await page.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        textLen: (document.body.innerText || '').length,
      }));
      if (!lib.h1) {
        failures.push({ route: '/dashboard', problems: ['no <h1> rendered'] });
        console.log('FAIL /dashboard — no <h1>');
      } else if (lib.textLen < 200) {
        failures.push({ route: '/dashboard', problems: [`text ${lib.textLen} < 200`] });
        console.log(`FAIL /dashboard — text ${lib.textLen} < 200`);
      } else {
        studioChecked += 1;
        console.log(`ok   /dashboard${' '.repeat(9)} signed in, text=${lib.textLen}`);
      }

      // Follow the first library row all the way into the read-out. Hard-coding a token
      // would rot the moment the seed is re-run, so this navigates the way a customer
      // does — which also proves the links the dashboard emits actually resolve.
      const row = page.locator('a[href^="/dashboard/v/"], a[href^="/dashboard/runs/"]').first();
      if ((await row.count()) === 0) {
        console.log('     (no library rows for this account — nothing further to follow)');
      } else {
        const href = await row.getAttribute('href');
        await row.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        const detail = await page.evaluate(() => ({
          h1: document.querySelector('h1')?.textContent?.trim() ?? null,
          textLen: (document.body.innerText || '').length,
        }));
        if (!detail.h1 || detail.textLen < 400) {
          failures.push({
            route: href,
            problems: [`detail thin: h1=${detail.h1}, text=${detail.textLen}`],
          });
          console.log(`FAIL ${href} — h1=${detail.h1} text=${detail.textLen}`);
        } else {
          studioChecked += 1;
          console.log(`ok   ${href.slice(0, 40).padEnd(40)} text=${detail.textLen}`);
        }
      }
    }

    if (pageErrors.length) {
      failures.push({ route: 'studio', problems: [`uncaught: ${pageErrors[0]}`] });
      console.log(`FAIL studio — ${pageErrors.length} uncaught page error(s): ${pageErrors[0]}`);
    }
  } catch (e) {
    failures.push({ route: 'studio', problems: [`threw: ${String(e).slice(0, 200)}`] });
    console.log(`FAIL studio — ${String(e).slice(0, 160)}`);
  }

  try {
    await authBrowser.close();
  } catch {
    /* nothing to clean up */
  }
}

if (failures.length) {
  console.log(`\nsmoke: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(
  `\nsmoke: all ${ROUTES.length} routes ok` +
    (betaChecked ? `, ${betaChecked} beta-gate assertions ok` : '') +
    (studioChecked ? `, ${studioChecked} Studio assertions ok` : ''),
);
