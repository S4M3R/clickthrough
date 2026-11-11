#!/usr/bin/env node
// Rebuild the example flow that ships in the package (../../examples), the one
// `clickthrough demo` and `npm start` serve. It is the synthetic Acme onboarding
// with comments in every state: one to check, one checked, one the agent is
// working on and one it has a question about. Run build-flows.mjs first.

import { promises as fs } from "node:fs";
import path from "node:path";
import { ROOT, WORK, capture, chromium, cli, comment, findFlow, projectDir, serve } from "./lib.mjs";

const FLOW = "acme-web/onboarding";
const { flow } = findFlow("onboarding");
const cap = path.join(WORK, "captures");
const server = await serve();
const browser = await chromium.launch();
const post = (body) => comment(server.url, FLOW, body);
const api = (id, action) => fetch(`${server.url}/api/flows/${encodeURIComponent(FLOW)}/comments/${id}/${action}`,
  { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
// The agent's side of one comment: capture the changed screen, then `done` with evidence.
async function finish(c, screen, variant, note, text) {
  const base = path.join(cap, `example-${screen}-v2`);
  await capture(browser, flow, screen, variant, base);
  cli("acme-web", ["screen", "onboarding", screen, "--image", `${base}.png`, "--boxes", `${base}.json`, "--note", note]);
  cli("acme-web", ["done", "onboarding", c.id, text, "--version", screen, "--image", `${base}.png`,
    "--link", "https://example.com/acme/web/pull/12", "--label", "PR #12 (sample link)", "--check", "npm test: 49 passed (sample)"]);
}

const github = await post({ screen: "signup", version: 1, text: "Put GitHub first. Most of our users are developers.",
  target: { k: "Button", l: "Continue with GitHub", x: 280, y: 220, w: 400, h: 42 } });
await finish(github, "signup", "github-first", "GitHub button first", "Swapped the buttons: GitHub is first.");

const hint = await post({ screen: "workspace", version: 1, target: null, text: "Say what a valid workspace URL looks like." });
await finish(hint, "workspace", "url-hint", "Hint under the URL field", "Added a hint under the URL field.");
await api(hint.id, "confirm");

await post({ screen: "connect", version: 1, target: null, text: "Can we show which sources most teams pick?" });
const stripe = await post({ screen: "stripe", version: 1, target: null, text: "Say that we never move money." });
cli("acme-web", ["reply", "onboarding", stripe.id, "Under the permissions list, or in the heading?"]);

await browser.close();
server.stop();

const out = path.join(ROOT, "examples");
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.cp(path.join(projectDir("acme-web"), ".clickthrough", "onboarding"), path.join(out, "onboarding"), { recursive: true });
console.log(`Example written to ${path.relative(process.cwd(), out)}/onboarding`);
process.exit(0);
