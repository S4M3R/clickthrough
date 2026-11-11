import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store, normalizeBoxes } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";

// 1x1 PNG
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "fr-"));
  const img = path.join(dir, "shot.png");
  await writeFile(img, PNG);
  return { dir: path.join(dir, ".clickthrough"), img };
}

test("builds a flow with versions, branches and comments", async () => {
  const { dir, img } = await fixture();
  const s = new Store(dir);
  await s.initFlow("onboarding", { title: "Onboarding" });
  const boxes = JSON.stringify({
    W: 100, H: 100,
    items: [
      { tag: "button", role: "", label: "Go", x: 1, y: 1, w: 20, h: 10 },
      { tag: "button", role: "", label: "Go", x: 1, y: 1, w: 20, h: 10 },
      { tag: "h1", role: "", label: "Title", x: 0, y: 0, w: 90, h: 30 },
      { tag: "a", role: "", label: "Off canvas", x: 95, y: 0, w: 40, h: 10 },
    ],
  });
  const a = await s.addScreenVersion("onboarding", "welcome", { image: img, boxes, title: "Welcome" });
  assert.equal(a.version.v, 1);
  assert.equal(a.version.image, "shots/welcome-v1.png");
  assert.deepEqual(a.version.items.map((i) => i.l), ["Title", "Go"]);
  const b = await s.addScreenVersion("onboarding", "welcome", { image: img, note: "Smaller" });
  assert.equal(b.version.v, 2);
  assert.deepEqual([b.version.W, b.version.H], [1, 1]);

  await s.addScreenVersion("onboarding", "form", { image: img });
  await s.addEdge("onboarding", "welcome", "form", "Sign up manually");
  await s.addEdge("onboarding", "welcome", "form", "Manual");
  const flow = await s.readFlow("onboarding");
  assert.equal(flow.start, "welcome");
  assert.deepEqual(flow.edges, [{ from: "welcome", to: "form", label: "Manual" }]);

  const c = await s.addComment("onboarding", { screen: "welcome", version: 2, target: { k: "Button", l: "Go", x: 1, y: 1, w: 20, h: 10 }, text: " Make it blue " });
  assert.equal(c.text, "Make it blue");
  await s.reply("onboarding", c.id, { text: "Done", author: "agent" });
  await s.setStatus("onboarding", c.id, "resolved");
  // A reviewer replying reopens the thread.
  const reopened = await s.reply("onboarding", c.id, { text: "Not quite" });
  assert.equal(reopened.status, "open");
  assert.equal(reopened.replies.length, 2);
  await assert.rejects(() => s.addComment("onboarding", { screen: "nope", text: "x" }), /No screen/);
  await assert.rejects(() => s.addComment("onboarding", { screen: "welcome", text: "  " }), /empty/);
  await assert.rejects(() => s.initFlow("../escape"), /Invalid flow id/);
});

test("normalizeBoxes accepts a double-encoded string", () => {
  const inner = JSON.stringify({ W: 10, H: 10, items: [{ tag: "p", label: "Hi", x: 0, y: 0, w: 5, h: 5 }] });
  assert.equal(normalizeBoxes(JSON.stringify(inner)).items[0].k, "Text");
});

test("serves several projects and refuses path traversal", async () => {
  const a = await fixture();
  const b = await fixture();
  for (const f of [a, b]) {
    const st = new Store(f.dir);
    await st.initFlow("onboarding", { title: "Onboarding" });
    await st.addScreenVersion("onboarding", "s", { image: f.img });
  }
  const projects = [
    { id: "web", name: "Web app", dir: a.dir },
    { id: "mobile", name: "Mobile", dir: b.dir },
  ];
  const app = createServer({ projects });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const list = await (await fetch(`${base}/api/flows`)).json();
    assert.deepEqual(list.map((f) => f.id).sort(), ["mobile/onboarding", "web/onboarding"]);
    assert.equal(list.find((f) => f.id === "web/onboarding").project.name, "Web app");
    const ps = await (await fetch(`${base}/api/projects`)).json();
    assert.deepEqual(ps.map((p) => [p.id, p.flows]), [["web", 1], ["mobile", 1]]);

    const key = encodeURIComponent("mobile/onboarding");
    const res = await fetch(`${base}/api/flows/${key}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "s", version: 1, target: null, text: "Hello" }),
    });
    assert.equal(res.status, 201);
    const got = await (await fetch(`${base}/api/flows/${key}`)).json();
    assert.equal(got.comments[0].text, "Hello");
    assert.equal(got.flow.id, "mobile/onboarding");
    // The comment landed in the mobile project only.
    assert.equal((await new Store(a.dir).readComments("onboarding")).length, 0);

    assert.equal((await fetch(`${base}/files/${key}/shots/s-v1.png`)).status, 200);
    assert.equal((await fetch(`${base}/files/${key}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)).status, 404);
    assert.equal((await fetch(`${base}/api/flows/${encodeURIComponent("web/../x")}`)).status, 404);
    assert.equal((await fetch(`${base}/api/flows/${encodeURIComponent("nope/onboarding")}`)).status, 404);
  } finally {
    await app.close();
  }
});

test("project registry adds, de-duplicates and removes", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "fr-home-"));
  process.env.CLICKTHROUGH_HOME = home;
  const { addProject, readProjects, removeProject, defaultProjectId } = await import("../src/projects.mjs");
  const one = path.join(home, "acme-web", ".clickthrough");
  const two = path.join(home, "other", "acme-web", ".clickthrough");
  assert.equal(defaultProjectId(one), "acme-web");
  const p1 = await addProject({ dir: one });
  const again = await addProject({ dir: one, name: "Acme web" });
  assert.equal(again.id, p1.id);
  assert.equal(again.name, "Acme web");
  const p2 = await addProject({ dir: two });
  assert.equal(p2.id, "acme-web-2");
  await assert.rejects(() => addProject({ dir: path.join(home, "x"), id: "acme-web" }), /already exists/);
  await removeProject("acme-web-2");
  assert.deepEqual((await readProjects()).map((p) => p.id), ["acme-web"]);
  delete process.env.CLICKTHROUGH_HOME;
});

test("markDone resolves with evidence and validates it", async () => {
  const { dir, img } = await fixture();
  const s = new Store(dir);
  await s.initFlow("f", {});
  await s.addScreenVersion("f", "a", { image: img });
  await s.addScreenVersion("f", "a", { image: img, note: "fixed" });
  const c = await s.addComment("f", { screen: "a", version: 1, text: "Fix the button" });
  const done = await s.markDone("f", c.id, {
    text: "Made it blue",
    evidence: [
      { type: "version" },
      { type: "image", file: img },
      { type: "link", url: "https://github.com/o/r/pull/1", label: "PR #1" },
      { type: "check", text: "npm test: 4 passed" },
    ],
  });
  assert.equal(done.status, "resolved");
  assert.equal(done.resolvedBy, "agent");
  const ev = done.replies.at(-1).evidence;
  assert.deepEqual(ev[0], { type: "version", screen: "a", v: 2 });
  assert.match(ev[1].path, /^evidence\/c_[0-9a-f]+-[0-9a-f]+\.png$/);
  assert.equal(ev[2].label, "PR #1");
  await assert.rejects(() => s.markDone("f", c.id, { text: "x", evidence: [{ type: "version", v: 9 }] }), /no v9/);
  await assert.rejects(() => s.markDone("f", c.id, { text: "x", evidence: [{ type: "link", url: "javascript:alert(1)" }] }), /http/);
});

test("a finished comment waits for the reviewer to check it", async () => {
  const { dir, img } = await fixture();
  const s = new Store(dir);
  await s.initFlow("f", {});
  await s.addScreenVersion("f", "a", { image: img });
  const c = await s.addComment("f", { screen: "a", version: 1, text: "Fix it" });
  await assert.rejects(() => s.confirm("f", c.id), /finished/);
  await s.markDone("f", c.id, { text: "Fixed" });
  assert.equal((await s.listFlows())[0].review, 1);
  const ok = await s.confirm("f", c.id);
  assert.ok(ok.confirmedAt);
  assert.equal((await s.listFlows())[0].review, 0);
  // A reply reopens it; done again needs a new check.
  const again = await s.reply("f", c.id, { text: "Not quite" });
  assert.equal(again.status, "open");
  assert.equal(again.confirmedAt, undefined);
  await s.markDone("f", c.id, { text: "Fixed again" });
  assert.equal((await s.listFlows())[0].review, 1);
  // Resolved by the reviewer by hand: nothing to check.
  await s.setStatus("f", c.id, "open");
  const mine = await s.setStatus("f", c.id, "resolved", "reviewer");
  assert.equal(mine.resolvedBy, "reviewer");
  assert.equal((await s.listFlows())[0].review, 0);
});

test("image attachments: real images only, referenced from comments and replies", async () => {
  const { dir, img } = await fixture();
  const app = createServer({ projects: [{ id: "p", name: "P", dir }] });
  const st = new Store(dir);
  await st.initFlow("f", {});
  await st.addScreenVersion("f", "a", { image: img });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const key = encodeURIComponent("p/f");
  try {
    const up = await fetch(`${base}/api/flows/${key}/attachments`, { method: "POST", headers: { "content-type": "image/png" }, body: PNG });
    assert.equal(up.status, 201);
    const { path: rel, url } = await up.json();
    assert.match(rel, /^attachments\/[a-z0-9-]+\.png$/);
    assert.equal((await fetch(base + url)).status, 200);

    const fake = await fetch(`${base}/api/flows/${key}/attachments`, { method: "POST", headers: { "content-type": "image/png" }, body: "<svg onload=alert(1)>" });
    assert.equal(fake.status, 415);

    const res = await fetch(`${base}/api/flows/${key}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "a", version: 1, target: null, text: "", images: [rel] }),
    });
    assert.equal(res.status, 201);
    const c = await res.json();
    assert.deepEqual(c.images, [rel]);
    assert.equal(c.text, "(see image)");

    const bad = await fetch(`${base}/api/flows/${key}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "a", text: "x", images: ["../../flow.json"] }),
    });
    assert.equal(bad.status, 400);

    const r = await st.reply("f", c.id, { text: "and this", images: [rel] });
    assert.deepEqual(r.replies[0].images, [rel]);
  } finally {
    await app.close();
  }
});

test("demo serves a private copy of the bundled example", async () => {
  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const home = await mkdtemp(path.join(tmpdir(), "ct-demo-"));
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
  const child = spawn("node", [cli, "demo", "--no-open", "--port", "0"], { env: { ...process.env, CLICKTHROUGH_HOME: home } });
  try {
    const url = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (d) => { out += d; const m = out.match(/http:\/\/localhost:\d+/); if (m) resolve(m[0]); });
      child.on("exit", () => reject(new Error(`demo exited early: ${out}`)));
    });
    const flows = await (await fetch(`${url}/api/flows`)).json();
    assert.deepEqual(flows.map((f) => f.id), ["demo/onboarding"]);
    assert.equal(flows[0].review, 1);
    // A comment lands in the copy, not in the package's examples folder.
    const key = encodeURIComponent("demo/onboarding");
    const res = await fetch(`${url}/api/flows/${key}/comments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "done", version: 1, target: null, text: "from the test" }),
    });
    assert.equal(res.status, 201);
    assert.match(await fs.readFile(path.join(home, "demo", "onboarding", "comments.json"), "utf8"), /from the test/);
    assert.doesNotMatch(await fs.readFile(path.join(path.dirname(cli), "..", "examples", "onboarding", "comments.json"), "utf8"), /from the test/);
  } finally {
    child.kill();
    await fs.rm(home, { recursive: true, force: true });
  }
});
