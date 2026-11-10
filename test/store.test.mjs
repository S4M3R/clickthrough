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
  return { dir: path.join(dir, ".flow-reviews"), img };
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

test("serves the API and refuses path traversal", async () => {
  const { dir, img } = await fixture();
  const app = createServer({ dir });
  await app.store.addScreenVersion("f", "s", { image: img }).catch(async () => {
    await app.store.initFlow("f", {});
    await app.store.addScreenVersion("f", "s", { image: img });
  });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const list = await (await fetch(`${base}/api/flows`)).json();
    assert.equal(list[0].id, "f");
    const res = await fetch(`${base}/api/flows/f/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "s", version: 1, target: null, text: "Hello" }),
    });
    assert.equal(res.status, 201);
    const { comments } = await (await fetch(`${base}/api/flows/f`)).json();
    assert.equal(comments[0].text, "Hello");
    assert.equal((await fetch(`${base}/files/f/shots/s-v1.png`)).status, 200);
    assert.equal((await fetch(`${base}/files/f/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)).status, 404);
    assert.equal((await fetch(`${base}/api/flows/..%2f..`)).status, 400);
  } finally {
    await app.close();
  }
});
