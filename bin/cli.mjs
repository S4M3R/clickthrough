#!/usr/bin/env node
// flow-reviews: capture a product flow as screens + branches, review it in a
// local web UI, and hand the comments to a coding agent. See README.md.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Store, UserError } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";
import { addProject, defaultProjectId, findProject, readProjects, registryFile, removeProject } from "../src/projects.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `flow-reviews: review a product flow screen by screen, with your coding agent.

Usage:
  flow-reviews                                       Open the review in your browser (all projects)
  flow-reviews serve    [--port 4777] [--open]       Same, without opening the browser
  flow-reviews projects                              List your projects
  flow-reviews projects add [<id>] [--dir <path>] [--name "Acme web"]
  flow-reviews projects remove <id>
  flow-reviews init     <flow> --title "Onboarding" [--start <screen>]
  flow-reviews screen   <flow> <screen> --image shot.png [--boxes boxes.json]
                        [--title "Create account"] [--route /signup] [--note "what changed"]
  flow-reviews edge     <flow> <from> <to> --label "Sign up with Google" [--via "Sign up with Google"]
                        (--via: text of the component that leads there, for Navigate mode)
  flow-reviews unedge   <flow> <from> <to>
  flow-reviews comments [<flow>] [--open]           Print comments as JSON
  flow-reviews reply    <flow> <comment-id> "text"  Reply as the agent
  flow-reviews resolve  <flow> <comment-id> [--reopen]
  flow-reviews watch    [<flow>] [--all] [--backlog] Print one JSON line per new reviewer comment
  flow-reviews boxes-script                          Path of the in-page script that measures components

Global:
  --project <id> Work on a registered project from anywhere
  --dir <path>   Where flows live (default: ./.flow-reviews, or $FLOW_REVIEWS_DIR)

\`init\` registers the project, so \`serve\` shows it next to your others.
Registry: $FLOW_REVIEWS_HOME/projects.json (default ~/.config/flow-reviews).
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
  let [cmd, ...rest] = process.argv.slice(2);
  // `flow-reviews` alone, or `flow-reviews review`: open the review in the browser.
  if (cmd === undefined || cmd === "review" || (cmd && cmd.startsWith("--") && cmd !== "--help")) {
    if (cmd && cmd.startsWith("--")) rest = [cmd, ...rest];
    cmd = "serve";
    if (!rest.includes("--no-open")) rest.push("--open");
  }
  const { pos, opts } = parseArgs(rest);
  // Which flows folder a command acts on: --dir, then --project, then the
  // env var, then ./.flow-reviews in the current folder.
  const explicitDir = typeof opts.dir === "string" ? opts.dir : null;
  const projectOpt = typeof opts.project === "string" ? opts.project : null;
  const dir = explicitDir || (projectOpt ? (await findProject(projectOpt)).dir : null) ||
    process.env.FLOW_REVIEWS_DIR || ".flow-reviews";
  const store = new Store(dir);

  switch (cmd) {
    case "serve": {
      // One folder when asked for; otherwise every registered project, plus
      // this folder's flows if it has any (registered on the way).
      let projects;
      if (explicitDir || projectOpt) {
        const known = (await readProjects()).find((p) => p.dir === path.resolve(dir));
        projects = [known ?? { id: defaultProjectId(dir), name: defaultProjectId(dir), dir: path.resolve(dir) }];
      } else {
        if (await exists(dir)) await addProject({ dir });
        projects = async () => {
          const list = await readProjects();
          return list.length ? list : [{ id: defaultProjectId(dir), name: defaultProjectId(dir), dir: path.resolve(dir) }];
        };
      }
      const app = createServer({ projects });
      const port = await app.listen(Number(opts.port || process.env.PORT || 4777), opts.host || "127.0.0.1");
      const url = `http://localhost:${port}`;
      const list = typeof projects === "function" ? await projects() : projects;
      console.log(`Flow Reviews is running at ${url}`);
      for (const p of list) console.log(`  ${p.id.padEnd(20)} ${p.dir}`);
      if (opts.open && !opts["no-open"]) {
        const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
      }
      return;
    }
    case "projects": {
      if (pos[0] === "add") {
        const project = await addProject({
          dir: explicitDir || ".flow-reviews",
          id: pos[1],
          name: typeof opts.name === "string" ? opts.name : undefined,
        });
        return out(project);
      }
      if (pos[0] === "remove") return out(await removeProject(need(pos[1], "<id>")));
      if (pos[0] && pos[0] !== "list") throw new UserError(`Unknown projects command "${pos[0]}".`);
      const list = await readProjects();
      if (!list.length) console.error(`No projects yet. Run \`flow-reviews init <flow>\` in a project. (${registryFile()})`);
      return out(list);
    }
    case "init": {
      const flow = await store.initFlow(need(pos[0], "<flow>"), { title: opts.title, start: opts.start });
      const project = await addProject({
        dir,
        id: typeof opts["project-id"] === "string" ? opts["project-id"] : undefined,
        name: typeof opts["project-name"] === "string" ? opts["project-name"] : undefined,
      });
      return out({ project: project.id, ...flow });
    }
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
          typeof opts.label === "string" ? opts.label : "",
          typeof opts.via === "string" ? opts.via : "")
      );
    case "unedge":
      return out(await store.removeEdge(need(pos[0], "<flow>"), need(pos[1], "<from>"), need(pos[2], "<to>")));
    case "comments": {
      const targets = opts.all
        ? (await readProjects()).map((p) => ({ project: p.id, store: new Store(p.dir) }))
        : [{ project: projectOpt || undefined, store }];
      const all = [];
      for (const t of targets) {
        const flows = pos[0] ? [pos[0]] : (await t.store.listFlows()).map((f) => f.id);
        for (const f of flows) {
          for (const c of await t.store.readComments(f).catch(() => [])) {
            if (opts.open && c.status !== "open") continue;
            all.push({ ...(t.project ? { project: t.project } : {}), flow: f, ...c });
          }
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
    case "watch": {
      const targets = opts.all
        ? async () => (await readProjects()).map((p) => ({ project: p.id, store: new Store(p.dir) }))
        : async () => [{ project: projectOpt || undefined, store }];
      return watchComments(targets, pos[0], Boolean(opts.backlog), opts.all ? "all projects" : store.dir);
    }
    case "boxes-script":
      return console.log(path.join(ROOT, "capture", "boxes.js"));
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
async function watchComments(getTargets, onlyFlow, backlog, label) {
  const seen = new Map(); // project/flow/comment -> number of messages already reported
  const describe = (c) => (c.target ? `${c.target.k}: ${c.target.l}`.trim() : "whole screen");
  let first = true;
  const tick = async () => {
    for (const { project, store } of await getTargets()) {
      const flows = onlyFlow ? [onlyFlow] : (await store.listFlows().catch(() => [])).map((f) => f.id);
      for (const flow of flows) {
        const comments = await store.readComments(flow).catch(() => []);
        for (const c of comments) {
          const key = `${project ?? ""}/${flow}/${c.id}`;
          const total = 1 + c.replies.length;
          const prev = seen.get(key) ?? (first && !backlog ? total : 0);
          seen.set(key, total);
          const msgs = [{ author: c.author, text: c.text, type: "comment" }, ...c.replies.map((r) => ({ ...r, type: "reply" }))];
          for (const m of msgs.slice(prev)) {
            if (m.author === "agent") continue;
            if (backlog && first && c.status !== "open") continue;
            process.stdout.write(
              JSON.stringify({
                type: m.type,
                ...(project ? { project } : {}),
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
    }
    first = false;
  };
  await tick();
  console.error(`Watching ${onlyFlow ? `flow "${onlyFlow}" in ` : ""}${label} for new comments…`);
  setInterval(() => tick().catch((e) => console.error(e.message)), 1000);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(err.message);
    process.exit(err.status === 404 ? 3 : 4);
  }
  console.error(err);
  process.exit(1);
});
