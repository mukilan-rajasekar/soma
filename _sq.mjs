import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
await p.goto('http://localhost:3055/demo-short',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
const r=await p.evaluate(()=>{
  const out=[];
  for(const sel of ['.rounded-2xl','.rounded-xl','.rounded-badge']){
    const els=[...document.querySelectorAll(sel)];
    const el=els.find(e=>e.getBoundingClientRect().width>40) ?? els[0];
    if(!el){out.push({sel,note:'none found'});continue;}
    const cs=getComputedStyle(el);
    out.push({sel, count:els.length, tag:el.tagName,
      cls:String(el.className).slice(0,50),
      w:Math.round(el.getBoundingClientRect().width),
      radius:cs.borderRadius, cornerShape:cs.cornerShape ?? cs.getPropertyValue('corner-shape')});
  }
  out.push({supports:CSS.supports('corner-shape','superellipse(2.6)')});
  // is the @supports sheet present at runtime?
  let found=0;
  for(const ss of document.styleSheets){ try{ for(const rule of ss.cssRules){ if(rule.cssText?.includes('corner-shape')) found++; } }catch(e){} }
  out.push({rulesWithCornerShape:found});
  return out;
});
console.log(JSON.stringify(r,null,1));
await b.close();
