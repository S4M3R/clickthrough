// Shared by the demo scripts: paths, a CLI runner and the screen capture.
// Everything is written under site/demo/.work (ignored by git) with its own
// project registry, so running the demo never touches your real projects.

import { execFileSync, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PROJECTS, VIEWPORT } from "./app.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..", "..");
export const WORK = path.join(HERE, ".work");
export const MEDIA = path.join(HERE, "..", "media");
export const CLI = path.join(ROOT, "bin", "cli.mjs");
export const PORT = Number(process.env.DEMO_PORT || 4791);
export const ENV = { ...process.env, CLICKTHROUGH_HOME: path.join(WORK, "home") };
delete ENV.CLICKTHROUGH_DIR;

export const projectDir = (id) => path.join(WORK, id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run `clickthrough <args>` inside a demo project and return its stdout. */
export function cli(project, args) {
  return execFileSync("node", [CLI, ...args], { cwd: projectDir(project), env: ENV, encoding: "utf8" });
}

/** Screenshot one synthetic screen and measure its components (what an agent does in a real app). */
export async function capture(browser, flow, screenId, variant, outBase) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.setContent(flow.screens[screenId].html(variant), { waitUntil: "load" });
  await page.screenshot({ path: `${outBase}.png`, fullPage: true });
  const boxes = await page.evaluate(await fs.readFile(path.join(ROOT, "capture", "boxes.js"), "utf8"));
  await fs.writeFile(`${outBase}.json`, boxes);
  await page.close();
}

export function findFlow(flowId) {
  for (const p of PROJECTS) for (const f of p.flows) if (f.id === flowId) return { project: p, flow: f };
  throw new Error(`No demo flow "${flowId}"`);
}

/** Start `clickthrough serve` for the demo projects; resolves once it answers. */
export async function serve() {
  const child = spawn("node", [CLI, "serve", "--port", String(PORT)], { cwd: WORK, env: ENV, stdio: "ignore" });
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${url}/api/projects`)).ok) return { url, stop: () => child.kill() }; } catch { /* not up yet */ }
    await sleep(100);
  }
  child.kill();
  throw new Error(`clickthrough serve did not start on port ${PORT}`);
}

/** Post a comment the way the web UI does (the reviewer's side has no CLI). */
export async function comment(url, flowKey, body, imageFile) {
  const base = `${url}/api/flows/${encodeURIComponent(flowKey)}`;
  if (imageFile) {
    const up = await fetch(`${base}/attachments`, { method: "POST", headers: { "content-type": "image/png" }, body: await fs.readFile(imageFile) });
    body = { ...body, images: [(await up.json()).path] };
  }
  const res = await fetch(`${base}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`comment failed: ${await res.text()}`);
  return res.json();
}

export { chromium };
