// Local HTTP server: the review UI, a small JSON API over the Store, and a
// server-sent-events stream that tells open pages when anything changed on disk
// (an agent added a screen version, replied to a comment, ...).

import http from "node:http";
import { promises as fs, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, UserError } from "./store.mjs";

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

export function createServer({ dir }) {
  const store = new Store(dir);
  const clients = new Set();

  // Watch the whole flow-reviews dir; debounce per flow so a burst of writes
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
  let watcher = null;
  const startWatch = async () => {
    await fs.mkdir(store.dir, { recursive: true });
    try {
      watcher = watch(store.dir, { recursive: true }, (_e, file) => {
        if (!file || String(file).endsWith(".tmp")) return;
        notify(String(file).split(path.sep)[0]);
      });
    } catch {
      // Recursive watch is unsupported on some Linux setups: fall back to a
      // poll of every flow's mtimes.
      const mtimes = new Map();
      setInterval(async () => {
        for (const f of await store.listFlows().catch(() => [])) {
          for (const name of ["flow.json", "comments.json"]) {
            const p = path.join(store.flowDir(f.id), name);
            const m = (await fs.stat(p).catch(() => null))?.mtimeMs ?? 0;
            if (mtimes.has(p) && mtimes.get(p) !== m) notify(f.id);
            mtimes.set(p, m);
          }
        }
      }, 1000).unref();
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (parts[0] === "api") return await api(req, res, parts.slice(1));
      if (parts[0] === "files" && parts.length >= 3) {
        const base = store.flowDir(parts[1]);
        return await sendFile(res, safeJoin(base, parts.slice(2).join("/")));
      }
      if (parts.length === 0) return await sendFile(res, path.join(UI_DIR, "index.html"));
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
    if (parts[0] !== "flows") throw new UserError("Not found", 404);
    const [, flowId, sub, cid, action] = parts;

    if (req.method === "GET" && !flowId) return json(res, await store.listFlows());
    if (req.method === "GET" && flowId && !sub) {
      const [flow, comments] = await Promise.all([store.readFlow(flowId), store.readComments(flowId)]);
      return json(res, { flow, comments });
    }
    if (req.method === "POST" && sub === "comments" && !cid) {
      return json(res, await store.addComment(flowId, await body(req)), 201);
    }
    if (req.method === "POST" && sub === "comments" && cid && action === "replies") {
      const b = await body(req);
      return json(res, await store.reply(flowId, cid, { text: b.text, author: b.author }));
    }
    if (req.method === "POST" && sub === "comments" && cid && action === "status") {
      return json(res, await store.setStatus(flowId, cid, (await body(req)).status));
    }
    throw new UserError("Not found", 404);
  }

  return {
    store,
    async listen(port, host = "127.0.0.1") {
      await startWatch();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      return server.address().port;
    },
    close() {
      watcher?.close();
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
