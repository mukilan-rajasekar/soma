import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('http://localhost:3055/demo-short',{waitUntil:'networkidle'});
await p.evaluate(async()=>{const m=document.querySelector('main');
  for(let y=0;y<m.scrollHeight;y+=400){m.scrollTop=y;await new Promise(r=>setTimeout(r,40));} m.scrollTop=0;});
await p.waitForTimeout(1500);
const r=await p.evaluate(()=>{const out=[];const w=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const t=(n.textContent||'').trim(); if(!t)continue; const el=n.parentElement; const cs=getComputedStyle(el);
  if(cs.visibility==='hidden'||cs.display==='none')continue; out.push({t,fs:parseFloat(cs.fontSize)});} return out;});
const S=640/1440; let words=0,dead=0;
for(const x of r){const n=x.t.split(/\s+/).length; words+=n; if(x.fs*S<7.2) dead+=n;}
console.log(`words ${words} | texture-only at 640px: ${dead} (${(dead/words*100).toFixed(0)}%)  [was 751/839 = 90%]`);
const em=r.filter(x=>/—/.test(x.t));
console.log('em dashes:', em.length, em.map(x=>x.t.slice(0,60)));
await b.close();
