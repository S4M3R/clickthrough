#!/usr/bin/env node
// Record the demo: a reviewer walks the flow in Navigate mode, comments on a
// component, and the scripted agent (agent.sh) answers with a new version and
// a Done reply with evidence. Run build-flows.mjs first.
//
// The picture is the real review UI in an iframe, with a terminal strip under
// it that prints what `clickthrough watch` and agent.sh actually output.
// Output: ../media/demo.mp4, demo.gif, demo-poster.jpg (needs ffmpeg).

import { execFileSync, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { CLI, ENV, HERE, MEDIA, WORK, chromium, projectDir, serve, sleep } from "./lib.mjs";

const SIZE = { width: 1440, height: 1060 };
const TERM_H = 190;
const COMMENT = "Put GitHub first. Most of our users are developers.";
// The UI and the terminal print absolute paths; show them from a neutral home.
const tidy = (s) => String(s).split(WORK).join("~/code");

const WRAPPER = (src) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#12141a;overflow:hidden}
iframe{display:block;width:100%;height:${SIZE.height - TERM_H}px;border:0;background:#fff}
#term{height:${TERM_H}px;box-sizing:border-box;border-top:1px solid #2b2f3a;color:#d7dae2;font:14px/1.5 "SF Mono",Menlo,monospace;display:flex;flex-direction:column}
#bar{flex:none;padding:5px 16px;color:#8b90a0;background:#181b23;border-bottom:1px solid #2b2f3a;font-size:12px}
#out{flex:1;overflow:hidden;padding:8px 16px;display:flex;flex-direction:column;justify-content:flex-end}
#out div{white-space:pre-wrap;overflow-wrap:anywhere}
#out .cmd{color:#fff}#out .note{color:#8b90a0}#out .json{color:#9ec1ff}
</style><iframe id="ui" src="${src}"></iframe>
<div id="term"><div id="bar">Your coding agent's terminal (scripted for this demo)</div><div id="out"></div></div>
<script>window.print1=(t)=>{const d=document.createElement("div");d.textContent=t;
d.className=t.startsWith("$")||t.startsWith("    --")?"cmd":t.startsWith("{")?"json":"note";
const o=document.getElementById("out");o.appendChild(d);while(o.children.length>7)o.firstChild.remove();}</script>`;

const CURSOR = `(() => {
  const c = document.createElement("div");
  c.id = "demo-cursor";
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 2l13 9-6 1.2L8 18z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  c.style.cssText = "position:fixed;left:-40px;top:-40px;z-index:99999;pointer-events:none;margin:-2px 0 0 -4px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))";
  document.documentElement.appendChild(c);
  addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { c.style.transform = "scale(.82)"; setTimeout(() => (c.style.transform = ""), 140); }, true);
})()`;

const server = await serve();
const browser = await chromium.launch();
let watch;
process.on("exit", () => { server.stop(); watch?.kill(); });
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2, colorScheme: "light" });
await context.route("**/api/projects", async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, json: (await res.json()).map((p) => ({ ...p, dir: tidy(p.dir) })) });
});
const page = await context.newPage();
await page.setContent(WRAPPER(server.url));
const ui = page.frameLocator("#ui");
await ui.locator("#projects .project").first().waitFor();
await page.frames()[1].evaluate(CURSOR);
const print = (line) => page.evaluate((t) => window.print1(t), tidy(line));

// ---- pointer helpers: ease the mouse to a target so the recording reads like a person ----
let mouse = { x: 720, y: 420 };
async function moveTo(locator, { dx = 0.5, dy = 0.5 } = {}) {
  await locator.waitFor();
  const b = await locator.boundingBox();
  const to = { x: b.x + b.width * dx, y: b.y + b.height * dy };
  const steps = 26;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(mouse.x + (to.x - mouse.x) * e, mouse.y + (to.y - mouse.y) * e);
    await sleep(14);
  }
  mouse = to;
}
async function click(locator, wait = 900, opts) {
  await moveTo(locator, opts);
  await sleep(350);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
  await sleep(wait);
}
const part = (label) => ui.locator(`.hs[aria-label*="Button: ${label}"]`);

// ---- screencast: keep every frame with its timestamp, encode at the end ----
const framesDir = path.join(WORK, "frames");
await fs.rm(framesDir, { recursive: true, force: true });
await fs.mkdir(framesDir, { recursive: true });
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = path.join(framesDir, `f${String(frames.length).padStart(5, "0")}.jpg`);
  frames.push({ file, t: metadata.timestamp });
  await fs.writeFile(file, Buffer.from(data, "base64"));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await page.mouse.move(mouse.x, mouse.y);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: SIZE.width * 2, maxHeight: SIZE.height * 2 });

// ---- the agent is already watching ----
watch = spawn("node", [CLI, "watch", "onboarding"], { cwd: projectDir("acme-web"), env: ENV });
let woke;
const gotComment = new Promise((resolve) => (woke = resolve));
readline.createInterface({ input: watch.stderr }).on("line", print);
readline.createInterface({ input: watch.stdout }).on("line", (line) => { print(line); woke(JSON.parse(line)); });
await print("$ clickthrough watch onboarding");
await sleep(1500);

// 1. Projects home -> the flow and its branch tree
await click(ui.getByText("Signup and onboarding"), 1700);

// 2. Navigate mode: click through the GitHub branch, then pick Stripe
await click(ui.locator('#mode [data-mode="navigate"]'), 700);
await click(part("Continue with GitHub"), 1100);
await click(part("Authorize Acme"), 1100);
await click(part("Continue"), 1100);
await click(ui.locator('.hs.go[aria-label*="Stripe"]'), 1500, { dy: 0.3 });

// 3. Back to the first screen, Comment mode, comment on the GitHub button
await click(ui.locator("#tree .row").first(), 700);
await click(ui.locator('#mode [data-mode="comment"]'), 500);
await click(part("Continue with GitHub"), 500);
await ui.locator("#popText").pressSequentially(COMMENT, { delay: 30 });
await sleep(500);
await click(ui.locator("#popSubmit"), 300);
const { comment } = await gotComment;
await sleep(600);

// 4. The agent answers: new version of the screen, then Done with evidence
await new Promise((resolve, reject) => {
  const agent = spawn(path.join(HERE, "agent.sh"), [comment], { env: { ...process.env, DEMO_PAUSE: "1" } });
  readline.createInterface({ input: agent.stdout }).on("line", print);
  agent.stderr.pipe(process.stderr);
  agent.on("exit", (code) => (code ? reject(new Error(`agent.sh exited ${code}`)) : resolve()));
});
await ui.locator(".status-check").waitFor();
await sleep(2000);

// 5. The finished comment is waiting under Changes: open it to see the screen
//    before and after, then accept it from the list
await click(ui.locator('#navView [data-view="changes"]'), 1000);
await click(ui.locator(".change").first(), 2600, { dx: 0.5, dy: 0.25 });
await click(ui.locator(".change .change-ok"), 2600);

await cdp.send("Page.stopScreencast");
await sleep(300);
const end = Date.now() / 1000;
watch.kill();
await browser.close();
server.stop();

// ---- encode ----
const list = frames.map((f, i) => {
  const d = Math.max(0.01, (frames[i + 1]?.t ?? Math.max(end, f.t + 0.5)) - f.t);
  return `file '${f.file}'\nduration ${d.toFixed(3)}`;
}).join("\n") + `\nfile '${frames.at(-1).file}'\n`;
const listFile = path.join(framesDir, "list.txt");
await fs.writeFile(listFile, list);
await fs.mkdir(MEDIA, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const input = ["-f", "concat", "-safe", "0", "-i", listFile];
ff([...input, "-vf", "fps=30,scale=1632:1200:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(MEDIA, "demo.mp4")]);
ff([...input, "-vf", "fps=10,scale=952:700:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", path.join(MEDIA, "demo.gif")]);
ff(["-sseof", "-0.2", "-i", path.join(MEDIA, "demo.mp4"), "-frames:v", "1", "-q:v", "3", path.join(MEDIA, "demo-poster.jpg")]);
console.log(`Recorded ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)}s -> ${path.relative(process.cwd(), MEDIA)}/demo.{mp4,gif}`);
