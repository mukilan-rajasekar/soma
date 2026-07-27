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
  // observed: text 11100, canvas 8, scroll 11277
  { path: '/demo', minText: 8000, minCanvas: 6, minScroll: 8000, needsH1: true },
  // observed: text 4729, canvas 7, scroll 6220
  { path: '/demo-short', minText: 3500, minCanvas: 5, minScroll: 4500, needsH1: true },
  // observed: text 3603, canvas 4, scroll 4521
  { path: '/preflight', minText: 2500, minCanvas: 3, minScroll: 3200, needsH1: true },
];

// A cancelled media preload is normal browser behaviour, not a defect.
const MEDIA = /\.(mp4|webm|mov|m4s|ogg)(\?|$)/i;
const isBenignFailure = (url, err) => MEDIA.test(url) && /ERR_ABORTED/.test(err || '');

const failures = [];

const browser = await chromium.launch();

for (const route of ROUTES) {
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
    if (status !== 200) problems.push(`status ${status} (want 200)`);

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

  if (problems.length) {
    failures.push({ route: route.path, problems });
    console.log(`FAIL ${route.path}`);
    for (const p of problems) console.log(`       - ${p}`);
  } else {
    console.log(
      `ok   ${route.path.padEnd(13)} text=${info.textLen} canvas=${info.canvases} scroll=${info.scrollH}`,
    );
  }

  await ctx.close();
}

await browser.close();

if (failures.length) {
  console.log(`\nsmoke: ${failures.length}/${ROUTES.length} route(s) failed`);
  process.exit(1);
}
console.log(`\nsmoke: all ${ROUTES.length} routes ok`);
