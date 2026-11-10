// Local HTTP server: the review UI, a small JSON API over the Store, and a
// server-sent-events stream that tells open pages when anything changed on disk
// (an agent added a screen version, replied to a comment, ...).

import http from "node:http";
import { promises as fs, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, UserError, MAX_ATTACHMENT_BYTES } from "./store.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/**
 * `projects` is either a fixed list of `{id, name, dir}` or an async function
 * returning one (re-read on every listing, so projects registered while the
 * server runs show up without a restart). Flows are addressed as
 * `<project>/<flow>` everywhere in the API, so two projects can both have an
 * "onboarding" flow.
 */
export function createServer({ projects, dir }) {
  const getProjects =
    typeof projects === "function"
      ? projects
      : async () => projects ?? [{ id: "local", name: "Local", dir }];
  const stores = new Map(); // project id -> Store
  const clients = new Set();

  async function resolve(key) {
    const [pid, flowId, ...extra] = String(key).split("/");
    if (!pid || !flowId || extra.length) throw new UserError(`Flow key must be "<project>/<flow>", got "${key}".`, 404);
    const project = (await getProjects()).find((p) => p.id === pid);
    if (!project) throw new UserError(`No project "${pid}".`, 404);
    return { project, store: storeFor(project), flowId };
  }
  function storeFor(project) {
    let st = stores.get(project.id);
    if (!st || st.dir !== path.resolve(project.dir)) {
      st = new Store(project.dir);
      stores.set(project.id, st);
      startWatch(project.id, st);
    }
    return st;
  }

  // Watch each project's flows folder; debounce per flow so a burst of writes
  // (image copy + flow.json rename) becomes one "change" event.
  const timers = new Map();
  const notify = (flow) => {
    clearTimeout(timers.get(flow));
    timers.set(
      flow,
      setTimeout(() => {
        const msg = `event: change\ndata: ${JSON.stringify({ flow })}\n\n`;
        for (const res of clients) res.write(msg);
      }, 150)
    );
  };
  const watchers = new Map();
  const startWatch = async (pid, store) => {
    watchers.get(pid)?.close?.();
    await fs.mkdir(store.dir, { recursive: true }).catch(() => {});
    try {
      watchers.set(
        pid,
        watch(store.dir, { recursive: true }, (_e, file) => {
          if (!file || String(file).endsWith(".tmp")) return;
          notify(`${pid}/${String(file).split(path.sep)[0]}`);
        })
      );
    } catch {
      // Recursive watch is unsupported on some Linux setups: poll mtimes.
      const mtimes = new Map();
      const timer = setInterval(async () => {
        for (const f of await store.listFlows().catch(() => [])) {
          for (const name of ["flow.json", "comments.json"]) {
            const p = path.join(store.flowDir(f.id), name);
            const m = (await fs.stat(p).catch(() => null))?.mtimeMs ?? 0;
            if (mtimes.has(p) && mtimes.get(p) !== m) notify(`${pid}/${f.id}`);
            mtimes.set(p, m);
          }
        }
      }, 1000);
      timer.unref();
      watchers.set(pid, { close: () => clearInterval(timer) });
    }
  };

  async function listAllFlows() {
    const out = [];
    for (const project of await getProjects()) {
      const flows = await storeFor(project).listFlows().catch(() => []);
      for (const f of flows) {
        out.push({ ...f, id: `${project.id}/${f.id}`, flow: f.id, project: { id: project.id, name: project.name } });
      }
    }
    return out;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (parts[0] === "api") return await api(req, res, parts.slice(1));
      if (parts[0] === "files" && parts.length >= 3) {
        const { store, flowId } = await resolve(parts[1]);
        return await sendFile(res, safeJoin(store.flowDir(flowId), parts.slice(2).join("/")));
      }
      // The UI routes itself: "/" is the projects home, "/p/<project>/<flow>/<screen>" a screen.
      if (parts.length === 0 || parts[0] === "p") return await sendFile(res, path.join(UI_DIR, "index.html"));
      if (parts[0] === "ui") return await sendFile(res, safeJoin(UI_DIR, parts.slice(1).join("/")));
      throw new UserError("Not found", 404);
    } catch (err) {
      sendError(res, err);
    }
  });

  async function api(req, res, parts) {
    if (req.method === "GET" && parts[0] === "events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(": connected\n\n");
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    if (req.method === "GET" && parts[0] === "projects") {
      const flows = await listAllFlows();
      return json(
        res,
        (await getProjects()).map((p) => ({
          id: p.id,
          name: p.name,
          dir: p.dir,
          flows: flows.filter((f) => f.project.id === p.id).length,
        }))
      );
    }
    if (parts[0] !== "flows") throw new UserError("Not found", 404);
    const [, key, sub, cid, action] = parts;

    if (req.method === "GET" && !key) return json(res, await listAllFlows());
    const { project, store, flowId } = await resolve(key);
    if (req.method === "GET" && !sub) {
      const [flow, comments] = await Promise.all([store.readFlow(flowId), store.readComments(flowId)]);
      return json(res, { flow: { ...flow, id: key }, comments, project: { id: project.id, name: project.name } });
    }
    if (req.method === "POST" && sub === "attachments") {
      // Raw image bytes in the body; the store checks they really are an image.
      const buf = await rawBody(req, MAX_ATTACHMENT_BYTES);
      const rel = await store.saveAttachment(flowId, buf);
      return json(res, { path: rel, url: `/files/${encodeURIComponent(key)}/${rel}` }, 201);
    }
    if (req.method === "POST" && sub === "comments" && !cid) {
      return json(res, await store.addComment(flowId, await body(req)), 201);
    }
    if (req.method === "POST" && sub === "comments" && cid && action === "replies") {
      const b = await body(req);
      return json(res, await store.reply(flowId, cid, { text: b.text, images: b.images, author: b.author }));
    }
    if (req.method === "POST" && sub === "comments" && cid && action === "status") {
      return json(res, await store.setStatus(flowId, cid, (await body(req)).status));
    }
    throw new UserError("Not found", 404);
  }

  return {
    async listen(port, host = "127.0.0.1") {
      for (const p of await getProjects()) storeFor(p);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      return server.address().port;
    },
    close() {
      for (const w of watchers.values()) w?.close?.();
      for (const res of clients) res.end();
      return new Promise((r) => server.close(r));
    },
  };
}

function safeJoin(base, rel) {
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new UserError("Not found", 404);
  return p;
}

async function sendFile(res, file) {
  let data;
  try {
    data = await fs.readFile(file);
  } catch {
    throw new UserError("Not found", 404);
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-cache",
  });
  res.end(data);
}

async function rawBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new UserError("Images can be up to 10 MB.", 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new UserError("Request body too large.", 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new UserError("Body is not valid JSON.");
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": TYPES[".json"] });
  res.end(JSON.stringify(data));
}

function sendError(res, err) {
  const status = err instanceof UserError ? err.status : 500;
  if (status === 500) console.error(err);
  if (res.headersSent) return res.end();
  json(res, { error: status === 500 ? "Internal error" : err.message }, status);
}
