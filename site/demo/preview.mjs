#!/usr/bin/env node
// Screenshot the landing page at desktop and phone widths: `node preview.mjs <out-dir>`.
import path from "node:path";
import { HERE, chromium } from "./lib.mjs";

const out = process.argv[2] || path.join(HERE, ".work");
const browser = await chromium.launch();
for (const [name, width, height] of [["desktop", 1440, 900], ["tablet", 900, 900], ["phone", 390, 800]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await page.goto(`file://${path.join(HERE, "..", "index.html")}`, { waitUntil: "networkidle" });
  await page.evaluate(async () => { for (const i of document.images) { i.loading = "eager"; await i.decode().catch(() => {}); } });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 0) console.log(`${name}: page is ${overflow}px wider than the viewport`);
  await page.screenshot({ path: path.join(out, `page-${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
