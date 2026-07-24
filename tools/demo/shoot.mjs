// Screenshot the /demo page section by section, scrolling so the reveal-on-enter
// animations fire (like a real recording pass). Full-page shot + per-section crops.
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2] || "/tmp/demo_shots";
const URL = process.argv[3] || "http://localhost:3111/demo";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" });

// scroll the whole page in steps so every IntersectionObserver fires and animations run
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < total; y += 700) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(420);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);

// per-section crops
const sections = await page.$$("section");
let i = 0;
for (const s of sections) {
  await s.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  try {
    await s.screenshot({ path: `${OUT}/section_${String(i).padStart(2, "0")}.png` });
  } catch (e) {
    console.log("skip section", i, e.message);
  }
  i++;
}

// full page
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/full.png`, fullPage: true });

console.log(`shot ${i} sections + full to ${OUT}`);
await browser.close();
