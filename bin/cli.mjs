#!/usr/bin/env node
// flow-reviews: capture a product flow as screens + branches, review it in a
// local web UI, and hand the comments to a coding agent. See README.md.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Store, UserError } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `flow-reviews: review a product flow screen by screen, with your coding agent.

Usage:
  flow-reviews serve    [--port 4777] [--open]       Start the review UI
  flow-reviews init     <flow> --title "Onboarding" [--start <screen>]
  flow-reviews screen   <flow> <screen> --image shot.png [--boxes boxes.json]
                        [--title "Create account"] [--route /signup] [--note "what changed"]
  flow-reviews edge     <flow> <from> <to> --label "Sign up with Google"
  flow-reviews unedge   <flow> <from> <to>
  flow-reviews comments [<flow>] [--open]           Print comments as JSON
  flow-reviews reply    <flow> <comment-id> "text"  Reply as the agent
  flow-reviews resolve  <flow> <comment-id> [--reopen]
  flow-reviews watch    [<flow>] [--backlog]        Print one JSON line per new reviewer comment
  flow-reviews boxes-script                          Path of the in-page script that measures components

Global:
  --dir <path>   Where flows live (default: ./.flow-reviews, or $FLOW_REVIEWS_DIR)
`;

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      if (inline !== undefined) opts[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) opts[k] = argv[++i];
      else opts[k] = true;
    } else pos.push(a);
  }
  return { pos, opts };
}

function need(value, what) {
  if (value === undefined || value === true || value === "") throw new UserError(`Missing ${what}.\n\n${HELP}`);
  return value;
}

const out = (data) => process.stdout.write(JSON.stringify(data, null, 2) + "\n");

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opts } = parseArgs(rest);
  const dir = opts.dir || process.env.FLOW_REVIEWS_DIR || ".flow-reviews";
  const store = new Store(dir);

  switch (cmd) {
    case "serve": {
      const app = createServer({ dir });
      const port = await app.listen(Number(opts.port || process.env.PORT || 4777), opts.host || "127.0.0.1");
      const url = `http://localhost:${port}`;
      console.log(`Flow Reviews is running at ${url}\nFlows: ${store.dir}`);
      if (opts.open) {
        const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
      }
      return;
    }
    case "init":
      return out(await store.initFlow(need(pos[0], "<flow>"), { title: opts.title, start: opts.start }));
    case "screen": {
      const flow = need(pos[0], "<flow>");
      const screen = need(pos[1], "<screen>");
      if (!opts.image && !opts.boxes) throw new UserError("Pass --image and/or --boxes.");
      await store.readFlow(flow).catch(async (err) => {
        if (err.status === 404) await store.initFlow(flow, {});
        else throw err;
      });
      const boxes = typeof opts.boxes === "string" ? await fs.readFile(opts.boxes, "utf8") : undefined;
      return out(
        await store.addScreenVersion(flow, screen, {
          image: typeof opts.image === "string" ? opts.image : undefined,
          boxes,
          title: typeof opts.title === "string" ? opts.title : undefined,
          route: typeof opts.route === "string" ? opts.route : undefined,
          note: typeof opts.note === "string" ? opts.note : undefined,
        })
      );
    }
    case "edge":
      return out(
        await store.addEdge(need(pos[0], "<flow>"), need(pos[1], "<from>"), need(pos[2], "<to>"),
          typeof opts.label === "string" ? opts.label : "")
      );
    case "unedge":
      return out(await store.removeEdge(need(pos[0], "<flow>"), need(pos[1], "<from>"), need(pos[2], "<to>")));
    case "comments": {
      const flows = pos[0] ? [pos[0]] : (await store.listFlows()).map((f) => f.id);
      const all = [];
      for (const f of flows) {
        for (const c of await store.readComments(f)) {
          if (opts.open && c.status !== "open") continue;
          all.push({ flow: f, ...c });
        }
      }
      return out(all);
    }
    case "reply":
      return out(
        await store.reply(need(pos[0], "<flow>"), need(pos[1], "<comment-id>"), {
          text: need(pos.slice(2).join(" ") || opts.text, '"text"'),
          author: "agent",
        })
      );
    case "resolve":
      return out(
        await store.setStatus(need(pos[0], "<flow>"), need(pos[1], "<comment-id>"), opts.reopen ? "open" : "resolved")
      );
    case "watch":
      return watchComments(store, pos[0], Boolean(opts.backlog));
    case "boxes-script":
      return console.log(path.join(ROOT, "capture", "boxes.js"));
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return process.stdout.write(HELP);
    default:
      throw new UserError(`Unknown command "${cmd}".\n\n${HELP}`);
  }
}

/**
 * Print one JSON line per new reviewer comment or reply, forever. Agents run
 * this as a background monitor so each comment wakes them up. Agent-authored
 * replies are not echoed (the agent wrote them).
 */
async function watchComments(store, onlyFlow, backlog) {
  const seen = new Map(); // comment id -> number of messages already reported
  const describe = (c) => (c.target ? `${c.target.k}: ${c.target.l}`.trim() : "whole screen");
  let first = true;
  const tick = async () => {
    const flows = onlyFlow ? [onlyFlow] : (await store.listFlows()).map((f) => f.id);
    for (const flow of flows) {
      const comments = await store.readComments(flow).catch(() => []);
      for (const c of comments) {
        const total = 1 + c.replies.length;
        const prev = seen.get(c.id) ?? (first && !backlog ? total : 0);
        seen.set(c.id, total);
        const msgs = [{ author: c.author, text: c.text, type: "comment" }, ...c.replies.map((r) => ({ ...r, type: "reply" }))];
        for (const m of msgs.slice(prev)) {
          if (m.author === "agent") continue;
          if (backlog && first && c.status !== "open") continue;
          process.stdout.write(
            JSON.stringify({
              type: m.type,
              flow,
              comment: c.id,
              screen: c.screen,
              version: c.version,
              target: describe(c),
              text: m.text,
            }) + "\n"
          );
        }
      }
    }
    first = false;
  };
  await tick();
  console.error(`Watching ${onlyFlow ? `flow "${onlyFlow}"` : "all flows"} in ${store.dir} for new comments…`);
  setInterval(() => tick().catch((e) => console.error(e.message)), 1000);
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(err.message);
    process.exit(err.status === 404 ? 3 : 4);
  }
  console.error(err);
  process.exit(1);
});
