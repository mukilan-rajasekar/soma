import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/private/tmp/claude-501/-Users-mukilan/fe8dfcb7-d815-4185-bebc-c2b8483bd2d1/scratchpad/rev2';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT + '/frames', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto('http://localhost:3055/demo-short', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const geo = await p.evaluate(() => { const m=document.querySelector('main');
  return { vh:m.clientHeight, sh:m.scrollHeight, hdr:m.querySelector(':scope > header')?.offsetHeight ?? 0 }; });
console.log('GEO', JSON.stringify(geo), '(was sh:6220)');
await p.screenshot({ path: `${OUT}/frames/00_leadin.png` });
const t0 = Date.now();
await p.evaluate(() => [...document.querySelectorAll('button')].find(x=>/\d+\s*s|▶/.test(x.textContent||'')).click());
let last=-1, still=0, shot=0, moved=false, lastShotAt=-1e9;
const deadline = Date.now()+80000;
while (Date.now() < deadline) {
  const st = await p.evaluate(() => Math.round(document.querySelector('main').scrollTop));
  const t = Date.now()-t0;
  if (st !== last) { if (last>=0 && Math.abs(st-last)>2) moved=true; still=0; } else still++;
  last = st;
  if (still===4 && (moved || t>3400) && t-lastShotAt>1500) {
    await p.waitForTimeout(700);
    const nm = `${String(++shot).padStart(2,'0')}_st${st}_t${Math.round((Date.now()-t0)/100)/10}s`;
    await p.screenshot({ path: `${OUT}/frames/${nm}.png` });
    console.log('SHOT', nm); lastShotAt = Date.now()-t0;
  }
  if (st >= geo.sh-geo.vh-2 && still>8) break;
  await p.waitForTimeout(100);
}
console.log('TAKE MS', Date.now()-t0, 'stops', shot, '(was 53395ms / 9 stops)');
await b.close();
