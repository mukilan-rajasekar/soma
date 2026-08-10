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
  // The free-audit funnel — linked from the footer, so it has to actually render.
  // observed: text 2028, canvas 0, scroll 1774
  { path: '/audit', minText: 1500, minCanvas: 0, minScroll: 1300, needsH1: true },
  // The account surfaces. observed: sign-in text 267, sign-up text 319, both scroll 900.
  { path: '/sign-in', minText: 200, minCanvas: 0, minScroll: 650, needsH1: true },
  { path: '/sign-up', minText: 240, minCanvas: 0, minScroll: 650, needsH1: true },
  // One field and a notice, small on purpose. observed: text 170, canvas 0, scroll 900
  { path: '/forgot-password', minText: 120, minCanvas: 0, minScroll: 650, needsH1: true },
  // Studio is behind a session. These two assert the BOUNDARY, which is the half of the
  // dashboard a smoke run can check without credentials — and the half that fails
  // catastrophically: a Studio route that 500s or renders for a stranger is worse than one
  // that looks wrong. src/proxy.ts redirects optimistically and requireUser() is the real
  // check, so both must land on /sign-in for a visitor with no cookie.
  { path: '/dashboard', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/brands', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/campaigns', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/campaigns/new', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/serve', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/account', expectRedirectTo: '/sign-in' },
  // /update-password is guarded like Studio even though it lives outside it: a recovery
  // session is signed in, everyone else bounces. This asserts the proxy matcher entry.
  { path: '/update-password', expectRedirectTo: '/sign-in' },
  { path: '/dashboard/runs/' + '0'.repeat(32), expectRedirectTo: '/sign-in' },
  // The recorded pipeline run. Its content comes from src/data/run-capture.json, so the
  // text floor is really an assertion that the capture is still wired in: an empty or
  // truncated capture renders a page with headings and no stages, which is exactly the
  // failure a floor catches. The number stays modest on purpose — a longer run has more
  // stages and more log, so this must not encode the size of one particular capture.
  { path: '/run', minText: 1200, minCanvas: 0, minScroll: 1400, needsH1: true },
  // Our own 404 page. The status is half the assertion; the text floor is the other half
  // — a blank stock 404 where src/app/not-found.tsx should be is the regression.
  // observed: text 252, scroll 900
  { path: '/definitely-not-a-page', expectStatus: 404, minText: 180, needsH1: true },
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

    // A non-200 route with no content floor has nothing else worth measuring: the token
    // 404s land wherever Next puts them, and checking the status IS the check. A non-200
    // route that DOES carry minText is asserting our own not-found page still says
    // something — those fall through to the measurement below.
    if (want !== 200 && route.minText === undefined) {
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
  // A route asserted to be a 404 makes the browser log "Failed to load resource …
  // status of 404" for the document itself. That line is the assertion working, not a
  // defect; any OTHER console error on the page still counts.
  const expected = route.expectStatus ?? 200;
  const realConsoleErrors =
    expected === 200
      ? consoleErrors
      : consoleErrors.filter((t) => !t.includes(`status of ${expected}`));
  if (realConsoleErrors.length)
    problems.push(`${realConsoleErrors.length} console error(s): ${realConsoleErrors[0]}`);
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

// ── Auth form copy ────────────────────────────────────────────────────────────
//
// noValidate means empty submit is ours to explain. These two sentences are the
// whole reason src/lib/auth-errors.ts exists — if they regress to Supabase's
// "missing email or phone" / "Invalid login credentials", this is the check.

{
  const ctx = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/sign-in', { waitUntil: 'networkidle', timeout: 45000 });
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(400);
    const empty = (await page.locator('div.text-error[role="alert"]').textContent())?.trim();
    if (empty !== 'Enter an email address.') {
      failures.push({ route: '/sign-in', problems: [`empty submit: ${JSON.stringify(empty)}`] });
      console.log(`FAIL /sign-in empty submit -> ${JSON.stringify(empty)}`);
    } else {
      console.log('ok   /sign-in        empty submit copy');
    }

    await page.locator('input[type="email"]').fill('nope@example.com');
    await page.locator('input[type="password"]').fill('wrong-password-xx');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('div.text-error[role="alert"]', { timeout: 15000 });
    const bad = (await page.locator('div.text-error[role="alert"]').textContent())?.trim();
    if (bad !== 'Email or password is wrong.') {
      failures.push({ route: '/sign-in', problems: [`bad creds: ${JSON.stringify(bad)}`] });
      console.log(`FAIL /sign-in bad creds -> ${JSON.stringify(bad)}`);
    } else {
      console.log('ok   /sign-in        bad-credentials copy');
    }

    const forgot = await page.locator('a[href*="forgot-password"]').getAttribute('href');
    await page.goto(BASE + '/sign-in?next=/dashboard/upload', { waitUntil: 'networkidle' });
    const forgotNext = await page.locator('a[href*="forgot-password"]').getAttribute('href');
    const createNext = await page.locator('a', { hasText: 'Create one' }).getAttribute('href');
    if (!forgotNext?.includes('next=') || !createNext?.includes('next=')) {
      failures.push({
        route: '/sign-in',
        problems: [`next not preserved: forgot=${forgotNext} create=${createNext}`],
      });
      console.log(`FAIL /sign-in next hop forgot=${forgotNext} create=${createNext}`);
    } else {
      console.log('ok   /sign-in        ?next= survives Create one / Forgot');
    }
    void forgot;
  } catch (e) {
    failures.push({ route: '/sign-in', problems: [`copy checks threw: ${String(e).slice(0, 160)}`] });
    console.log(`FAIL /sign-in copy checks — ${String(e).slice(0, 160)}`);
  }
  await ctx.close();
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

      // Follow the first video row into the read-out. Prefer /dashboard/v/ (a cut)
      // over the run header: that is the click a customer makes, and a multi-ad
      // seed puts "Open full run" first in the DOM.
      const row = page.locator('a[href^="/dashboard/v/"]').first();
      if ((await row.count()) === 0) {
        console.log('     (no library rows for this account — nothing further to follow)');
      } else {
        const href = await row.getAttribute('href');
        await Promise.all([
          page.waitForURL(
            (u) => u.pathname.startsWith('/dashboard/v/') || u.pathname.startsWith('/dashboard/runs/'),
            { timeout: 30000 },
          ),
          row.click(),
        ]);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        const detail = await page.evaluate(() => ({
          h1: document.querySelector('h1')?.textContent?.trim() ?? null,
          path: location.pathname,
          textLen: (document.body.innerText || '').length,
        }));
        if (detail.path === '/dashboard' || detail.h1 === 'Your videos.') {
          failures.push({
            route: href,
            problems: [`stayed on library: path=${detail.path} h1=${detail.h1}`],
          });
          console.log(`FAIL ${href} — stayed on library`);
        } else if (!detail.h1 || detail.textLen < 400) {
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

      // The account page — the cheapest proof the whole lifecycle surface renders
      // behind a session: display name, the password form, sign out.
      await page.goto(BASE + '/dashboard/account', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      const account = await page.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        textLen: (document.body.innerText || '').length,
      }));
      if (!account.h1 || account.textLen < 150) {
        failures.push({
          route: '/dashboard/account',
          problems: [`account thin: h1=${account.h1}, text=${account.textLen}`],
        });
        console.log(`FAIL /dashboard/account — h1=${account.h1} text=${account.textLen}`);
      } else {
        studioChecked += 1;
        console.log(`ok   /dashboard/account${' '.repeat(3)} text=${account.textLen}`);
      }

      // Recovery without SMTP: admin generateLink → hashed_token into /auth/callback.
      // Needs the service role. Unset, skip — same posture as the beta gate.
      const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
        /\/$/,
        '',
      );
      const sbSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!sbUrl || !sbSecret) {
        console.log('     skip recovery E2E — set SUPABASE_SECRET_KEY to exercise /update-password');
      } else {
        const gen = await fetch(`${sbUrl}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: {
            apikey: sbSecret,
            Authorization: `Bearer ${sbSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'recovery', email: smokeEmail }),
        });
        const genBody = await gen.json().catch(() => ({}));
        const props = genBody.properties && typeof genBody.properties === 'object' ? genBody.properties : genBody;
        const hashed = props.hashed_token || genBody.hashed_token;
        const actionToken = (() => {
          try {
            const link = props.action_link || genBody.action_link;
            return link ? new URL(link).searchParams.get('token') : null;
          } catch {
            return null;
          }
        })();
        const tokenHash = hashed || actionToken;
        const userId = genBody.user?.id || genBody.id;
        if (!gen.ok || !tokenHash) {
          failures.push({
            route: '/update-password',
            problems: [`generate_link ${gen.status}: ${JSON.stringify(genBody).slice(0, 180)}`],
          });
          console.log(`FAIL /update-password generate_link ${gen.status}`);
        } else {
          // Real email-click: the visitor is signed out (often another device).
          // Recovery also revokes the previous session, so staying signed in here
          // would hide a callback that minted cookies the browser never stored.
          const signOut = page.locator('form[action="/api/auth/sign-out"] button[type="submit"]').last();
          if ((await signOut.count()) > 0) {
            await Promise.all([
              page.waitForURL((u) => u.pathname === '/' || u.pathname === '/sign-in', {
                timeout: 20000,
              }),
              signOut.click(),
            ]);
          }
          // New-device email click: no leftover studio cookies. Also guards a
          // sign-out that redirected without clearing Set-Cookie.
          await ctx.clearCookies();

          const callback =
            BASE +
            '/auth/callback?token_hash=' +
            encodeURIComponent(tokenHash) +
            '&type=recovery&next=' +
            encodeURIComponent('/update-password');
          await page.goto(callback, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForURL((u) => u.pathname !== '/auth/callback', { timeout: 45000 });
          const landed = new URL(page.url());
          if (landed.pathname !== '/update-password') {
            failures.push({
              route: '/update-password',
              problems: [
                `callback landed on ${landed.pathname}${landed.search}, want /update-password`,
              ],
            });
            console.log(`FAIL /update-password landed ${landed.pathname}${landed.search}`);
          } else {
            const rotated = `${smokePassword}-r`;
            await page.locator('input[autocomplete="new-password"]').nth(0).fill(rotated);
            await page.locator('input[autocomplete="new-password"]').nth(1).fill(rotated);
            await Promise.all([
              page.waitForURL((u) => u.pathname === '/dashboard' || u.pathname.startsWith('/dashboard'), {
                timeout: 45000,
              }),
              page.locator('button[type="submit"]').click(),
            ]);
            studioChecked += 1;
            console.log('ok   /update-password recovery link → new password → studio');

            // Put the original password back so SOMA_SMOKE_PASSWORD in .env stays valid.
            if (userId) {
              await fetch(`${sbUrl}/auth/v1/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                  apikey: sbSecret,
                  Authorization: `Bearer ${sbSecret}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: smokePassword }),
              });
            }
          }
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
