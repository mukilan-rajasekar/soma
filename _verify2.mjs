import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT='/private/tmp/claude-501/-Users-mukilan/fe8dfcb7-d815-4185-bebc-c2b8483bd2d1/scratchpad/rev2/verify';
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
await p.goto('http://localhost:3055/demo-short',{waitUntil:'networkidle'});
await p.waitForTimeout(2000);

// A. survivor count at the settle instant of §03
await p.evaluate(()=>{document.querySelector('main').scrollTop=2078;});
await p.waitForTimeout(700);
await p.screenshot({path:`${OUT}/A_cull_700ms.png`,clip:{x:540,y:360,width:700,height:70}});
console.log('A @700ms:', await p.evaluate(()=>[...document.querySelectorAll('div')].find(d=>/generated/.test(d.textContent||'')&&d.textContent.length<60)?.textContent));

// B. editor payoff: when does the score reach its final value?
await p.evaluate(()=>{document.querySelector('main').scrollTop=4224;});
const seen=[];
for(let t=0;t<=7000;t+=500){
  const s=await p.evaluate(()=>{
    const el=[...document.querySelectorAll('*')].find(e=>/^SOMA SCORE$/i.test((e.textContent||'').trim()));
    const panel=el?.parentElement; const num=panel?.querySelector('.tabular-nums,[class*="text-["]');
    const txt=panel?.textContent??''; const m=txt.match(/(\d{2})/g);
    const cs=[...document.querySelectorAll('canvas')].map(c=>{const r=c.getBoundingClientRect();
      if(r.y<200||r.y>800)return null; const x=c.getContext('2d'); if(!x)return null;
      const d=x.getImageData(0,0,c.width,c.height).data; let n=0;
      for(let k=0;k<d.length;k+=4*37) if(d[k+3]>10&&(d[k]<235||d[k+1]<235||d[k+2]<235)) n++;
      return {y:Math.round(r.y),ink:n};}).filter(Boolean);
    return {nums:m?m.slice(0,3):null, canvases:cs};
  });
  seen.push({t,...s});
  await p.waitForTimeout(500);
}
console.log('B. editor over time:'); seen.forEach(s=>console.log(`   ${String(s.t).padStart(5)}ms nums=${JSON.stringify(s.nums)} canvas=${JSON.stringify(s.canvases)}`));
await p.screenshot({path:`${OUT}/B_edit_final.png`,clip:{x:230,y:330,width:990,height:230}});

// C. filmstrip polarity
await p.evaluate(()=>{document.querySelector('main').scrollTop=3605;});
await p.waitForTimeout(2500);
await p.screenshot({path:`${OUT}/C_strip.png`,clip:{x:230,y:480,width:990,height:140}});

// D. squircle actually applied?
const sq=await p.evaluate(()=>{
  const el=document.querySelector('.rounded-2xl');
  const cs=getComputedStyle(el);
  const badge=document.querySelector('.rounded-badge');
  return {cornerShape:cs.getPropertyValue('corner-shape'), radius:cs.borderRadius,
          badge: badge?getComputedStyle(badge).borderRadius:null,
          badgeShape: badge?getComputedStyle(badge).getPropertyValue('corner-shape'):null};
});
console.log('D. squircle:', JSON.stringify(sq));
await b.close();
