import { chromium } from 'playwright';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader']});
const p=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
await p.goto('http://localhost:3055/demo-short',{waitUntil:'networkidle'});
await p.evaluate(()=>{document.querySelector('main').scrollTop=682;});
await p.waitForTimeout(4000);
await p.screenshot({path:'/private/tmp/claude-501/-Users-mukilan/fe8dfcb7-d815-4185-bebc-c2b8483bd2d1/scratchpad/rev2/brain_after.png',clip:{x:850,y:330,width:362,height:396}});
await b.close();
