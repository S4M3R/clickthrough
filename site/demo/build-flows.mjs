#!/usr/bin/env node
// Build the demo projects from scratch with the same CLI an agent uses:
// init, one `screen` per capture, one `edge` per choice.
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROJECTS } from "./app.mjs";
import { WORK, capture, chromium, cli, projectDir } from "./lib.mjs";

await fs.rm(WORK, { recursive: true, force: true });
const shots = path.join(WORK, "captures");
await fs.mkdir(shots, { recursive: true });
const browser = await chromium.launch();

for (const project of PROJECTS) {
  await fs.mkdir(projectDir(project.id), { recursive: true });
  for (const flow of project.flows) {
    cli(project.id, ["init", flow.id, "--title", flow.title, "--start", flow.start, "--project-id", project.id, "--project-name", project.name]);
    for (const [id, screen] of Object.entries(flow.screens)) {
      const base = path.join(shots, `${flow.id}-${id}`);
      await capture(browser, flow, id, undefined, base);
      cli(project.id, ["screen", flow.id, id, "--image", `${base}.png`, "--boxes", `${base}.json`, "--title", screen.title, "--route", screen.route,
        ...(screen.note ? ["--note", screen.note] : [])]);
    }
    for (const [from, to, label, via] of flow.edges) cli(project.id, ["edge", flow.id, from, to, "--label", label, "--via", via]);
    console.log(`${project.id}/${flow.id}: ${Object.keys(flow.screens).length} screens, ${flow.edges.length} edges`);
  }
}
await browser.close();
