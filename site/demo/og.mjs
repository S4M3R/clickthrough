#!/usr/bin/env node
// Render the social image from og.html (1200x630) to ../og.png and ../launch/og.png.
// It uses the stills in ../media, so run shots.mjs first if those changed.
import { promises as fs } from "node:fs";
import path from "node:path";
import { HERE, chromium } from "./lib.mjs";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(HERE, "og.html")}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(HERE, "..", "og.png") });
await fs.copyFile(path.join(HERE, "..", "og.png"), path.join(HERE, "..", "launch", "og.png"));
await browser.close();
