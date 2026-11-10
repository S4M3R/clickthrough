#!/usr/bin/env node
// Capture one synthetic screen: `node capture.mjs <flow> <screen> <variant|-> <out-base>`
// writes <out-base>.png and <out-base>.json (the boxes). Used by agent.sh.
import { capture, chromium, findFlow } from "./lib.mjs";

const [flowId, screen, variant, out] = process.argv.slice(2);
if (!out) { console.error("usage: capture.mjs <flow> <screen> <variant|-> <out-base>"); process.exit(2); }
const browser = await chromium.launch();
await capture(browser, findFlow(flowId).flow, screen, variant === "-" ? undefined : variant, out);
await browser.close();
