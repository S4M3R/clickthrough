// Storage for flows and comments. Everything is plain JSON files inside the
// project's flow-reviews directory, so the agent and the human see the same
// state, and it can be committed (or ignored) like any other project file.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function assertId(kind, id) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new UserError(
      `Invalid ${kind} id "${id}". Use letters, numbers, dots, dashes or underscores.`
    );
  }
  return id;
}

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }

  flowDir(flowId) {
    return path.join(this.dir, assertId("flow", flowId));
  }

  async listFlows() {
    let entries = [];
    try {
      entries = await fs.readdir(this.dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const out = [];
    for (const e of entries) {
      if (!e.isDirectory() || !ID_RE.test(e.name)) continue;
      const flow = await this.readFlow(e.name).catch(() => null);
      if (!flow) continue;
      const comments = await this.readComments(e.name);
      out.push({
        id: flow.id,
        title: flow.title,
        screens: Object.keys(flow.screens).length,
        open: comments.filter((c) => c.status === "open").length,
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  async readFlow(flowId) {
    const file = path.join(this.flowDir(flowId), "flow.json");
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") throw new UserError(`No flow "${flowId}".`, 404);
      throw err;
    }
    const flow = JSON.parse(raw);
    flow.id = flowId;
    flow.screens ??= {};
    flow.edges ??= [];
    return flow;
  }

  async writeFlow(flow) {
    await writeJson(path.join(this.flowDir(flow.id), "flow.json"), flow);
  }

  async readComments(flowId) {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.flowDir(flowId), "comments.json"), "utf8")
      );
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async writeComments(flowId, comments) {
    await writeJson(path.join(this.flowDir(flowId), "comments.json"), comments);
  }

  async initFlow(flowId, { title, start } = {}) {
    assertId("flow", flowId);
    let flow;
    try {
      flow = await this.readFlow(flowId);
    } catch (err) {
      if (err.status !== 404) throw err;
      flow = { id: flowId, title: title || flowId, start: start || null, screens: {}, edges: [] };
    }
    if (title) flow.title = title;
    if (start) flow.start = assertId("screen", start);
    await this.writeFlow(flow);
    return flow;
  }

  /**
   * Add a new version of a screen (creating the screen on first use). The image
   * is copied into the flow's shots folder so the flow stays self-contained.
   */
  async addScreenVersion(flowId, screenId, { image, boxes, title, route, note }) {
    assertId("screen", screenId);
    const flow = await this.readFlow(flowId);
    const screen = (flow.screens[screenId] ??= {
      title: title || screenId,
      route: route || "",
      versions: [],
    });
    if (title) screen.title = title;
    if (route !== undefined && route !== null) screen.route = route;
    if (!flow.start) flow.start = screenId;

    const v = screen.versions.length + 1;
    let version = { v, image: null, W: null, H: null, note: note || "", at: new Date().toISOString(), items: [] };

    if (boxes) {
      const parsed = normalizeBoxes(boxes);
      version = { ...version, W: parsed.W, H: parsed.H, items: parsed.items };
      if (!screen.route && parsed.url) screen.route = parsed.url;
    }
    if (image) {
      const ext = path.extname(image).toLowerCase() || ".png";
      const rel = `shots/${screenId}-v${v}${ext}`;
      const dest = path.join(this.flowDir(flowId), rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(image, dest);
      version.image = rel;
      if (!version.W || !version.H) {
        const size = await imageSize(dest);
        if (size) Object.assign(version, size);
      }
    }
    screen.versions.push(version);
    await this.writeFlow(flow);
    return { screen: screenId, version };
  }

  /**
   * Connect two screens. `label` names the choice in the tree ("Sign up with
   * Google"); `via` is the visible text of the component that triggers it, so
   * Navigate mode can follow a click on that component (defaults to matching
   * the label).
   */
  async addEdge(flowId, from, to, label = "", via = "") {
    assertId("screen", from);
    assertId("screen", to);
    const flow = await this.readFlow(flowId);
    const existing = flow.edges.find((e) => e.from === from && e.to === to);
    if (existing) {
      existing.label = label || existing.label;
      if (via) existing.via = via;
    } else flow.edges.push(via ? { from, to, label, via } : { from, to, label });
    await this.writeFlow(flow);
    return flow.edges;
  }

  async removeEdge(flowId, from, to) {
    const flow = await this.readFlow(flowId);
    flow.edges = flow.edges.filter((e) => !(e.from === from && e.to === to));
    await this.writeFlow(flow);
    return flow.edges;
  }

  async addComment(flowId, { screen, version, target = null, text, author = "reviewer" }) {
    const flow = await this.readFlow(flowId);
    if (!flow.screens[screen]) throw new UserError(`No screen "${screen}".`, 404);
    const body = cleanText(text);
    const comment = {
      id: "c_" + crypto.randomBytes(5).toString("hex"),
      screen,
      version: Number(version) || flow.screens[screen].versions.length || 1,
      target: cleanTarget(target),
      text: body,
      author: author === "agent" ? "agent" : "reviewer",
      status: "open",
      createdAt: new Date().toISOString(),
      replies: [],
    };
    const comments = await this.readComments(flowId);
    comments.push(comment);
    await this.writeComments(flowId, comments);
    return comment;
  }

  async reply(flowId, commentId, { text, author = "reviewer" }) {
    return this.#update(flowId, commentId, (c) => {
      c.replies.push({
        author: author === "agent" ? "agent" : "reviewer",
        text: cleanText(text),
        at: new Date().toISOString(),
      });
      // A reviewer answering a resolved thread means it isn't done.
      if (author !== "agent" && c.status === "resolved") c.status = "open";
    });
  }

  async setStatus(flowId, commentId, status) {
    if (status !== "open" && status !== "resolved") {
      throw new UserError(`Status must be "open" or "resolved".`);
    }
    return this.#update(flowId, commentId, (c) => {
      c.status = status;
    });
  }

  async #update(flowId, commentId, fn) {
    const comments = await this.readComments(flowId);
    const c = comments.find((x) => x.id === commentId);
    if (!c) throw new UserError(`No comment "${commentId}".`, 404);
    fn(c);
    await this.writeComments(flowId, comments);
    return c;
  }
}

function cleanText(text) {
  const s = String(text ?? "").trim();
  if (!s) throw new UserError("Comment text is empty.");
  if (s.length > 8000) throw new UserError("Comment text is too long (8000 characters max).");
  return s;
}

function cleanTarget(t) {
  if (!t || typeof t !== "object") return null;
  const num = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);
  return {
    k: String(t.k ?? "").slice(0, 40),
    l: String(t.l ?? "").slice(0, 200),
    x: num(t.x),
    y: num(t.y),
    w: num(t.w),
    h: num(t.h),
  };
}

const KIND = {
  h1: "Heading", h2: "Heading", h3: "Heading", h4: "Heading", h5: "Heading", h6: "Heading",
  p: "Text", label: "Label", button: "Button", a: "Link", input: "Input", textarea: "Input",
  select: "Select", img: "Image", svg: "Image", li: "List item", pre: "Code", code: "Code",
};
const ROLE_KIND = { tab: "Tab", radio: "Radio", checkbox: "Checkbox", dialog: "Dialog" };

/**
 * Turn the output of capture/boxes.js (a JSON string, or the parsed object, or
 * a JSON string of a JSON string as some browser CLIs print it) into version
 * fields: W, H, url and normalized, de-duplicated items sorted largest first.
 */
export function normalizeBoxes(input) {
  let d = input;
  for (let i = 0; i < 2 && typeof d === "string"; i++) d = JSON.parse(d);
  if (!d || !Array.isArray(d.items)) throw new UserError("Boxes JSON has no items array.");
  const W = Math.round(d.W || d.vw || 0);
  const H = Math.round(d.H || 0);
  const seen = new Set();
  const items = [];
  for (const it of d.items) {
    if (!(it.w > 0 && it.h > 0)) continue;
    if (W && it.x + it.w > W + 2) continue;
    if (H && it.y >= H) continue;
    const key = [it.x, it.y, it.w, it.h].map((n) => Math.floor(n / 3)).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      k: it.k || ROLE_KIND[it.role] || KIND[it.tag] || it.tag || "Element",
      l: String(it.l ?? it.label ?? "").slice(0, 200),
      x: Math.round(it.x),
      y: Math.round(it.y),
      w: Math.round(it.w),
      h: Math.round(it.h),
    });
  }
  items.sort((a, b) => b.w * b.h - a.w * a.h);
  return { W, H, url: d.url || null, items };
}

/** Width/height of a PNG or JPEG, read from its header. Null if unknown. */
export async function imageSize(file) {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const b = buf.subarray(0, bytesRead);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
      return { W: b.readUInt32BE(16), H: b.readUInt32BE(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { H: b.readUInt16BE(i + 5), W: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    return null;
  } finally {
    await fh.close();
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write-then-rename so a reader (the UI, `watch`) never sees half a file.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await fs.rename(tmp, file);
}
