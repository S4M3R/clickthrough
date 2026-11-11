#!/usr/bin/env node
// Stills for the landing page, taken from the real UI on the synthetic flows.
// Run build-flows.mjs first (this script adds comments and runs agent.sh, so it
// needs a fresh .work). Output: ../media/*.webp, ../og.png, ../launch/og.png, ../launch/media/*.png.

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { HERE, MEDIA, WORK, chromium, comment, serve, sleep } from "./lib.mjs";

const FLOW = "acme-web/onboarding";
const tmp = path.join(WORK, "stills");
await fs.mkdir(tmp, { recursive: true });
await fs.mkdir(MEDIA, { recursive: true });

const server = await serve();
process.on("exit", () => server.stop());
const browser = await chromium.launch();

// A reference sketch for the reviewer to attach (drawn here, like everything else in the demo).
const sketch = path.join(tmp, "sketch.png");
{
  const p = await browser.newPage({ viewport: { width: 420, height: 150 }, deviceScaleFactor: 2 });
  await p.setContent(`<body style="margin:0;background:#fffbe8;font:15px system-ui;display:grid;place-items:center;height:150px">
    <div><div style="font:600 13px system-ui;margin-bottom:6px">Workspace URL</div>
    <div style="border:2px solid #17191c;border-radius:8px;padding:9px 12px;width:300px"><span style="color:#8a8c90">acme.example/</span><b>northwind</b></div>
    <div style="color:#b3541e;font:italic 13px system-ui;margin-top:8px">↑ fixed prefix, they only type the last part</div></div>`);
  await p.screenshot({ path: sketch });
  await p.close();
}

// Seed: one comment the agent has finished, one with an image, one open question.
const first = await comment(server.url, FLOW, {
  screen: "signup", version: 1, text: "Put GitHub first. Most of our users are developers.",
  target: { k: "Button", l: "Continue with GitHub", x: 280, y: 220, w: 400, h: 42 },
});
execFileSync(path.join(HERE, "agent.sh"), [first.id], { env: { ...process.env, DEMO_PAUSE: "0" }, stdio: "ignore" });
await comment(server.url, FLOW, { screen: "connect", version: 1, target: null, text: "Can we show which sources most teams pick?" });
await comment(server.url, FLOW, { screen: "stripe", version: 1, target: null, text: "Say that we never move money." });

const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
await context.route("**/api/projects", async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, json: (await res.json()).map((p) => ({ ...p, dir: p.dir.split(WORK).join("~/code") })) });
});
const page = await context.newPage();
// PNG -> WebP with the browser's own encoder, so the script needs no image tools.
const encoder = await browser.newPage();
async function toWebp(png) {
  const b64 = (await fs.readFile(png)).toString("base64");
  const out = await encoder.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.9);
  }, `data:image/png;base64,${b64}`);
  return Buffer.from(out.split(",")[1], "base64");
}
const shot = async (name, opts = {}) => {
  const png = path.join(tmp, `${name}.png`);
  await (opts.locator ? opts.locator.screenshot({ path: png }) : page.screenshot({ path: png, clip: opts.clip }));
  await fs.writeFile(path.join(MEDIA, `${name}.webp`), await toWebp(png));
};
const MAIN = { x: 280, y: 0, width: 1000, height: 700 }; // the middle column: toolbar and screen
const open = async (screen) => { await page.goto(`${server.url}/p/${FLOW}/${screen}`); await page.locator("#frame img").waitFor(); await sleep(400); };

// Projects home
await page.goto(server.url);
await page.locator("#projects .project").first().waitFor();
await shot("projects", { clip: { x: 300, y: 70, width: 680, height: 210 } });

// Navigate mode: hovering a component that leads to the next screen
await open("connect");
await page.keyboard.press("n");
await page.locator('.hs.go[aria-label*="Stripe"]').hover({ position: { x: 150, y: 30 } });
await sleep(200);
await shot("navigate", { clip: MAIN });
await shot("tree", { locator: page.locator("#tree > .tree") });

// Comment mode: a comment on one component, with a pasted image
await open("workspace");
await page.keyboard.press("c");
await page.locator("#outline").check();
await page.locator('.hs[aria-label*="Input: acme.example"]').click();
await page.locator("#popText").fill("Keep the acme.example/ prefix fixed, like this sketch.");
await page.locator("#popFile").setInputFiles(sketch);
await page.locator(".pop-thumb:not(.uploading)").waitFor();
await shot("comment", { clip: MAIN });
await page.locator("#popSubmit").click();
await page.locator("#outline").uncheck();

// Done with evidence, and the version switch
await open("signup");
await page.locator(".ev-image img").evaluate((img) => img.decode());
await shot("evidence", { locator: page.locator(".thread").first() });
await shot("versions", { clip: { x: 280, y: 0, width: 1000, height: 300 } });
await shot("done");

// Changes: the open change with the screen before and after
await page.locator('#navView [data-view="changes"]').click();
await page.locator(".change").first().click();
await page.locator(".cmp-frame img").last().evaluate((img) => img.decode());
await shot("compare", { clip: { x: 0, y: 0, width: 1280, height: 470 } });
await page.locator('#navView [data-view="tree"]').click();

// Social image: the template in og.html, at exactly 1200x630.
execFileSync("node", [path.join(HERE, "og.mjs")], { stdio: "inherit" });

// X does not take WebP: keep PNG copies of the screenshots the thread uses.
await fs.mkdir(path.join(HERE, "..", "launch", "media"), { recursive: true });
for (const name of ["tree", "comment", "navigate", "evidence"]) {
  await fs.copyFile(path.join(tmp, `${name}.png`), path.join(HERE, "..", "launch", "media", `${name}.png`));
}

await browser.close();
console.log(`Stills written to ${path.relative(process.cwd(), MEDIA)}`);
process.exit(0);
