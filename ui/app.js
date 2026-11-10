// Clickthrough web UI. Talks to the local `clickthrough serve` API (see SPEC.md).
// Vanilla ES module, no build step. All user-supplied text is set with
// textContent, never innerHTML.

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

const state = {
  flows: [],          // [{id,title,screens,open}]
  flowId: null,
  flow: null,         // flow.json
  comments: [],
  screenId: null,
  versionPick: {},    // screenId -> chosen version number (absent = latest)
  order: [],          // screen ids in tree walk order (drives prev/next)
  filter: "open",
  lit: null,          // highlighted comment id
  draft: null,        // { screen, target, text } for the open popover
};

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 3200);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function caretSvg(open) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 10 10");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "caret" + (open ? " open" : ""));
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M3.5 2 L7 5 L3.5 8");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.5");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.appendChild(p);
  return s;
}

// ---------- Flow helpers ----------
const screens = () => state.flow?.screens ?? {};
const edges = () => state.flow?.edges ?? [];
const outs = (id) => edges().filter((e) => e.from === id && screens()[e.to]);
const screenComments = (id) =>
  state.comments
    .filter((c) => c.screen === id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const openCount = (id) => state.comments.filter((c) => c.screen === id && c.status !== "resolved").length;
const latestV = (scr) => scr?.versions?.length ? scr.versions[scr.versions.length - 1].v : null;
function currentVersion(scr, id) {
  if (!scr?.versions?.length) return null;
  const pick = state.versionPick[id];
  return scr.versions.find((v) => v.v === pick) ?? scr.versions[scr.versions.length - 1];
}
const targetLabel = (t) => (t ? `${t.k}: ${t.l || "(no text)"}` : "Whole screen");

/**
 * Turn the flow graph into a branch tree (SPEC "Tree derivation").
 * Node shapes: {type:"screen", id, n} | {type:"branch", key, label, children}
 * | {type:"join", id}. Also returns the walk order and unreachable screens.
 */
function deriveTree() {
  const seen = new Set();
  const order = [];
  function walk(startId) {
    const out = [];
    let n = 0;
    let id = startId;
    while (id) {
      if (seen.has(id)) { out.push({ type: "join", id }); break; }
      seen.add(id);
      order.push(id);
      out.push({ type: "screen", id, n: ++n });
      const o = outs(id);
      if (o.length === 0) break;
      if (o.length === 1) { id = o[0].to; continue; }
      for (const e of o) {
        out.push({ type: "branch", key: `${e.from}->${e.to}`, label: e.label || screens()[e.to]?.title || e.to, children: walk(e.to) });
      }
      break;
    }
    return out;
  }
  const start = state.flow?.start && screens()[state.flow.start] ? state.flow.start : Object.keys(screens())[0];
  const tree = start ? walk(start) : [];
  const unlinked = Object.keys(screens()).filter((id) => !seen.has(id));
  for (const id of unlinked) order.push(id);
  return { tree, unlinked, order };
}

// Does this subtree contain the given screen? (auto-expand its branches)
const containsScreen = (nodes, id) =>
  nodes.some((n) => (n.type === "screen" && n.id === id) || (n.type === "branch" && containsScreen(n.children, id)));

// ---------- Rendering: tree ----------
const collapsed = (() => { try { return new Set(JSON.parse(store.get("fr-collapsed") || "[]")); } catch { return new Set(); } })();
const saveCollapsed = () => store.set("fr-collapsed", JSON.stringify([...collapsed]));
let expandedFor = null;

function renderTree() {
  const wrap = $("tree");
  wrap.textContent = "";
  if (!state.flow) return;
  const { tree, unlinked, order } = deriveTree();
  state.order = order;
  // When the selected screen changes, open the branches that lead to it (a
  // manual collapse afterwards sticks until the next selection).
  if (expandedFor !== state.screenId) {
    expandedFor = state.screenId;
    const openPath = (nodes) => {
      for (const n of nodes) {
        if (n.type === "branch" && containsScreen(n.children, state.screenId)) { collapsed.delete(n.key); openPath(n.children); }
      }
    };
    openPath(tree);
    saveCollapsed();
  }

  const renderNodes = (nodes) => {
    const ul = el("ul");
    for (const node of nodes) {
      const li = el("li");
      if (node.type === "screen") {
        const scr = screens()[node.id];
        const b = el("button", "row");
        b.type = "button";
        b.setAttribute("aria-current", node.id === state.screenId ? "true" : "false");
        b.append(el("span", "n", String(node.n).padStart(2, "0")), el("span", "t", scr.title || node.id));
        b.title = scr.title || node.id;
        const oc = openCount(node.id);
        if (oc) { const bd = el("span", "badge", String(oc)); bd.setAttribute("aria-label", `${oc} open comments`); b.appendChild(bd); }
        b.onclick = () => selectScreen(node.id);
        li.appendChild(b);
      } else if (node.type === "join") {
        const scr = screens()[node.id];
        const b = el("button", "row join-row");
        b.type = "button";
        b.append(el("span", "n", "↪"), el("span", "t", `continues at ${scr?.title || node.id}`));
        b.onclick = () => selectScreen(node.id);
        li.appendChild(b);
      } else {
        const open = !collapsed.has(node.key);
        li.setAttribute("aria-expanded", String(open));
        const b = el("button", "row branch-row");
        b.type = "button";
        b.setAttribute("aria-expanded", String(open));
        b.append(caretSvg(open), el("span", "t", node.label));
        const oc = countOpenIn(node.children);
        if (oc) b.appendChild(el("span", "badge", String(oc)));
        b.onclick = () => {
          if (open) collapsed.add(node.key); else collapsed.delete(node.key);
          saveCollapsed();
          renderTree();
        };
        li.appendChild(b);
        if (open) {
          const body = renderNodes(node.children);
          body.className = "branch-body";
          li.appendChild(body);
        }
      }
      ul.appendChild(li);
    }
    return ul;
  };

  const root = renderNodes(tree);
  root.className = "tree";
  wrap.appendChild(root);
  if (unlinked.length) {
    wrap.appendChild(el("div", "group-label", "Unlinked"));
    const ul = renderNodes(unlinked.map((id, i) => ({ type: "screen", id, n: i + 1 })));
    ul.className = "tree";
    wrap.appendChild(ul);
  }
}

function countOpenIn(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.type === "screen") n += openCount(node.id);
    else if (node.type === "branch") n += countOpenIn(node.children);
  }
  return n;
}

// ---------- Rendering: stage ----------
function renderStage() {
  const frame = $("frame");
  const empty = $("empty");
  frame.textContent = "";
  hideTip();

  const id = state.screenId;
  const scr = screens()[id];
  $("screenTitle").textContent = scr ? scr.title || id : state.flow ? "No screens yet" : "";
  $("screenRoute").hidden = !scr?.route;
  $("screenRoute").textContent = scr?.route || "";
  const idx = state.order.indexOf(id);
  $("prev").disabled = idx <= 0;
  $("next").disabled = idx < 0 || idx >= state.order.length - 1;
  $("commentScreen").disabled = !scr?.versions?.length;

  // Versions
  const seg = $("versions");
  seg.textContent = "";
  const v = currentVersion(scr, id);
  seg.hidden = !scr || (scr.versions?.length ?? 0) < 2;
  for (const ver of scr?.versions ?? []) {
    const b = el("button", null, `v${ver.v}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(ver.v === v?.v));
    b.title = ver.note || `Version ${ver.v}`;
    b.onclick = () => { state.versionPick[id] = ver.v; renderStage(); };
    seg.appendChild(b);
  }
  const note = $("versionNote");
  note.hidden = !v?.note;
  note.textContent = v?.note ? `v${v.v}${v.v === latestV(scr) ? " (latest)" : ""}: ${v.note}` : "";

  if (!state.flow) {
    frame.hidden = true;
    empty.hidden = false;
    renderNoFlows(empty);
    return;
  }
  if (!scr || !v) {
    frame.hidden = true;
    empty.hidden = false;
    empty.textContent = "";
    empty.append(el("h3", null, scr ? "No captures for this screen yet" : "This flow has no screens yet"));
    empty.append(el("p", null, "Add a capture from your project with:"));
    const [proj, flowName] = String(state.flowId).split("/");
    empty.append(el("pre", null, `clickthrough screen ${flowName ?? proj} ${id || "<screen>"} --image shot.png --boxes boxes.json${flowName ? ` --project ${proj}` : ""}`));
    return;
  }
  frame.hidden = false;
  empty.hidden = true;
  frame.classList.toggle("show", $("outline").checked);

  const img = new Image();
  img.src = `/files/${encodeURIComponent(state.flowId)}/${v.image.split("/").map(encodeURIComponent).join("/")}`;
  img.alt = `${scr.title || id}, version ${v.v}`;
  img.width = v.W;
  img.height = v.H;
  frame.style.aspectRatio = `${v.W} / ${v.H}`;
  frame.classList.toggle("navigate", state.mode === "navigate");
  frame.appendChild(img);

  const pct = (n, d) => `${(n / d) * 100}%`;
  (v.items ?? []).forEach((it, i) => {
    const h = el("button", "hs");
    h.type = "button";
    h.dataset.key = itemKey(it);
    h.style.left = pct(it.x, v.W);
    h.style.top = pct(it.y, v.H);
    h.style.width = pct(it.w, v.W);
    h.style.height = pct(it.h, v.H);
    const link = state.mode === "navigate" ? edgeForItem(it) : null;
    if (state.mode === "navigate") h.classList.add(link ? "go" : "dead");
    const dest = link ? screens()[link.to]?.title || link.to : null;
    h.setAttribute("aria-label", link ? `${targetLabel(it)}: go to ${dest}` : `Comment on ${targetLabel(it)}`);
    if (state.mode === "navigate" && !link) h.tabIndex = -1;
    h.addEventListener("mouseenter", (e) => showTip(e, it, dest));
    h.addEventListener("mousemove", moveTip);
    h.addEventListener("mouseleave", hideTip);
    h.addEventListener("click", () => {
      if (state.mode !== "navigate") return openPopover(it, h);
      hideTip();
      if (link) selectScreen(link.to);
      else toast("This doesn't lead anywhere in the flow yet. Switch to Comment to say where it should go.");
    });
    if (h.tabIndex !== -1) h.tabIndex = 0;
    h.dataset.idx = String(i);
    frame.appendChild(h);
  });

  // Pins: every comment on this screen; dim the ones from other versions.
  screenComments(id).forEach((c, i) => {
    const pin = el("button", "pin", String(i + 1));
    pin.type = "button";
    const t = c.target;
    const W = v.W, H = v.H;
    const x = t ? t.x + t.w / 2 : W - 28;
    const y = t ? t.y : 28;
    pin.style.left = pct(Math.min(Math.max(x, 12), W - 12), W);
    pin.style.top = pct(Math.max(y, 14), H);
    if (c.status === "resolved") pin.classList.add("resolved");
    if (c.version !== v.v) pin.classList.add("dim");
    if (state.lit === c.id) pin.classList.add("lit");
    pin.setAttribute("aria-label", `Comment ${i + 1}: ${c.text}`);
    pin.title = c.text;
    pin.onclick = () => lightComment(c.id, true);
    frame.appendChild(pin);
  });
  applyLit();
}

function renderNoFlows(box) {
  box.textContent = "";
  box.append(el("h3", null, "No flows yet"));
  box.append(el("p", null, "Create a flow and add screen captures from your project. They show up here as soon as they're written."));
  box.append(el("pre", null,
    "clickthrough init onboarding --title \"Onboarding\" --start signup\n" +
    "clickthrough screen onboarding signup --image signup.png --boxes signup.json --title \"Sign up\"\n" +
    "clickthrough edge onboarding signup verify --label \"Continue with email\""));
}

const itemKey = (it) => `${it.x},${it.y},${it.w},${it.h}`;

// ---------- Navigate mode ----------
// An edge can name the component that triggers it (`via`, e.g. "Sign up with
// Google"); otherwise its label is matched against the component's text.
const norm = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();
function edgeForItem(it) {
  const label = norm(it.l);
  if (!label) return null;
  const out = edges().filter((e) => e.from === state.screenId && screens()[e.to]);
  return (
    out.find((e) => e.via && (label === norm(e.via) || label.startsWith(norm(e.via)))) ||
    out.find((e) => !e.via && e.label && (label === norm(e.label) || (norm(e.label).length >= 3 && label.startsWith(norm(e.label))))) ||
    null
  );
}
function setMode(mode) {
  state.mode = mode === "navigate" ? "navigate" : "comment";
  store.set("fr-mode", state.mode);
  document.querySelectorAll("#mode [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
  closePopover();
  renderStage();
}

function showTip(e, it, dest = null) {
  if (state.mode === "navigate" && !dest) return;
  const t = $("tip");
  t.textContent = "";
  if (dest) t.append(el("span", "k", "Go to"), el("span", "go-to", dest));
  else t.append(el("span", "k", it.k), document.createTextNode(it.l || "(no text)"));
  t.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  const t = $("tip");
  t.style.left = `${Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8)}px`;
  t.style.top = `${e.clientY + 16}px`;
}
function hideTip() { $("tip").hidden = true; }

// ---------- Popover (new comment) ----------
function openPopover(target, anchor) {
  hideTip();
  const keep = state.draft && state.draft.screen === state.screenId &&
    ((state.draft.target && target && itemKey(state.draft.target) === itemKey(target)) || (!state.draft.target && !target));
  state.draft = { screen: state.screenId, target, text: keep ? state.draft.text : "", images: keep ? state.draft.images ?? [] : [] };
  const pop = $("popover");
  $("popTarget").textContent = targetLabel(target);
  $("popText").value = state.draft.text;
  renderDraftImages();
  pop.hidden = false;
  placePopover(anchor);
  $("popText").focus();
}
function placePopover(anchor) {
  const pop = $("popover");
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left), innerWidth - pw - 8);
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
function closePopover() {
  $("popover").hidden = true;
  state.draft = null;
}
// ---------- Attachments ----------
const fileUrl = (rel) => `/files/${encodeURIComponent(state.flowId)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

async function attachFiles(files) {
  if (!state.draft) return;
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) { toast("Only PNG, JPEG, WebP or GIF images can be attached."); continue; }
    if (file.size > 10 * 1024 * 1024) { toast("Images can be up to 10 MB."); continue; }
    if (state.draft.images.length >= 6) { toast("Up to 6 images per comment."); break; }
    // Show it straight away; the upload replaces the local preview with the stored path.
    const item = { preview: URL.createObjectURL(file), path: null };
    state.draft.images.push(item);
    renderDraftImages();
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(state.flowId)}/attachments`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      item.path = data.path;
    } catch (e) {
      toast(e.message);
      if (state.draft) state.draft.images = state.draft.images.filter((x) => x !== item);
    }
    renderDraftImages();
  }
}

function renderDraftImages() {
  const box = $("popImages");
  box.textContent = "";
  const imgs = state.draft?.images ?? [];
  box.hidden = imgs.length === 0;
  imgs.forEach((item, i) => {
    const t = el("div", "pop-thumb" + (item.path ? "" : " uploading"));
    const img = el("img");
    img.src = item.preview;
    img.alt = `Attachment ${i + 1}`;
    const rm = el("button", null, "×");
    rm.type = "button";
    rm.setAttribute("aria-label", `Remove attachment ${i + 1}`);
    rm.onclick = () => { state.draft.images.splice(i, 1); renderDraftImages(); };
    t.append(img, rm);
    box.appendChild(t);
  });
}

function imagesBlock(paths) {
  const box = el("div", "msg-images");
  for (const rel of paths) {
    const a = el("a");
    a.href = fileUrl(rel);
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", (ev) => ev.stopPropagation());
    const img = el("img");
    img.src = fileUrl(rel);
    img.alt = "Attached image";
    img.loading = "lazy";
    a.appendChild(img);
    box.appendChild(a);
  }
  return box;
}

async function submitPopover() {
  const d = state.draft;
  const text = $("popText").value.trim();
  if (!d) return;
  if (d.images.some((x) => !x.path)) { toast("Wait for the images to finish uploading."); return; }
  const images = d.images.map((x) => x.path);
  if (!text && !images.length) return;
  const scr = screens()[d.screen];
  const v = currentVersion(scr, d.screen);
  $("popSubmit").disabled = true;
  try {
    const c = await api(`/api/flows/${encodeURIComponent(state.flowId)}/comments`, {
      method: "POST",
      body: { screen: d.screen, version: v?.v ?? null, target: d.target, text, images },
    });
    closePopover();
    upsertComment(c);
    state.lit = c.id;
    renderAll();
    toast("Comment added");
  } catch (e) {
    toast(e.message);
  } finally {
    $("popSubmit").disabled = false;
  }
}

// ---------- Threads panel ----------
function renderThreads() {
  const box = $("threads");
  const scrollTop = box.scrollTop;
  box.textContent = "";
  const all = screenComments(state.screenId);
  const list = state.filter === "open" ? all.filter((c) => c.status !== "resolved") : all;
  if (!list.length) {
    box.appendChild(el("p", "none", all.length ? "No open comments on this screen." : "No comments yet. Click a component on the screen to add one."));
    return;
  }
  const v = currentVersion(screens()[state.screenId], state.screenId);
  for (const c of list) {
    const num = all.indexOf(c) + 1;
    const card = el("article", "thread");
    card.dataset.id = c.id;
    if (c.status === "resolved") card.classList.add("resolved");
    if (state.lit === c.id) card.classList.add("lit");

    const head = el("div", "th-head");
    head.append(el("span", "th-num", String(num)), el("span", "th-target", targetLabel(c.target)));
    if (c.version != null) {
      const vv = el("span", "th-ver", `v${c.version}`);
      if (v && c.version !== v.v) vv.title = "Left on another version";
      head.appendChild(vv);
    }
    if (c.status === "resolved") head.appendChild(el("span", "status-ok", c.resolvedBy === "agent" ? "Done" : "Resolved"));
    card.appendChild(head);

    card.appendChild(message(c.author, c.text));
    if (c.images?.length) card.appendChild(imagesBlock(c.images));
    if (c.replies?.length) {
      const reps = el("div", "replies");
      for (const r of c.replies) {
        reps.appendChild(message(r.author, r.text));
        if (r.images?.length) reps.appendChild(imagesBlock(r.images));
        if (r.evidence?.length) reps.appendChild(evidenceBlock(r.evidence));
      }
      card.appendChild(reps);
    }

    const actions = el("div", "th-actions");
    const input = el("input");
    input.type = "text";
    input.placeholder = "Reply";
    input.setAttribute("aria-label", `Reply to comment ${num}`);
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendReply(c, input); });
    const toggle = el("button", "btn", c.status === "resolved" ? "Reopen" : "Resolve");
    toggle.type = "button";
    toggle.onclick = (e) => { e.stopPropagation(); setStatus(c, c.status === "resolved" ? "open" : "resolved"); };
    actions.append(input, toggle);
    card.appendChild(actions);

    card.onclick = () => lightComment(c.id, false);
    box.appendChild(card);
  }
  box.scrollTop = scrollTop;
}

// What the agent showed to prove a change: the screen version, screenshots,
// links (PR, deploy) and checks that passed.
function evidenceBlock(items) {
  const box = el("div", "evidence");
  box.appendChild(el("p", "ev-title", "Evidence"));
  for (const e of items) {
    if (e.type === "version") {
      const b = el("button", "ev-version", `View ${screens()[e.screen]?.title || e.screen} · v${e.v}`);
      b.type = "button";
      b.onclick = (ev) => {
        ev.stopPropagation();
        state.versionPick[e.screen] = e.v;
        if (e.screen === state.screenId) renderAll();
        else selectScreen(e.screen);
      };
      box.appendChild(b);
    } else if (e.type === "image") {
      const src = `/files/${encodeURIComponent(state.flowId)}/${e.path.split("/").map(encodeURIComponent).join("/")}`;
      const a = el("a", "ev-image");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener";
      a.addEventListener("click", (ev) => ev.stopPropagation());
      const img = el("img");
      img.src = src;
      img.alt = "Evidence screenshot";
      img.loading = "lazy";
      a.appendChild(img);
      box.appendChild(a);
    } else if (e.type === "link") {
      const a = el("a", "ev-link", e.label || e.url);
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = e.url;
      a.addEventListener("click", (ev) => ev.stopPropagation());
      box.appendChild(a);
    } else if (e.type === "check") {
      const p = el("p", "ev-check");
      p.append(el("span", "ok", "✓"), document.createTextNode(e.text));
      box.appendChild(p);
    }
  }
  return box;
}

function message(author, text) {
  const m = el("div", "msg" + (author === "agent" ? " agent" : ""));
  m.append(el("span", "who", author === "agent" ? "Agent" : "Reviewer"), document.createTextNode(text));
  return m;
}

async function sendReply(c, input) {
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    const updated = await api(`/api/flows/${encodeURIComponent(state.flowId)}/comments/${encodeURIComponent(c.id)}/replies`, {
      method: "POST", body: { text, author: "reviewer" },
    });
    upsertComment(updated);
    renderAll();
  } catch (e) { toast(e.message); input.disabled = false; }
}

async function setStatus(c, status) {
  try {
    const updated = await api(`/api/flows/${encodeURIComponent(state.flowId)}/comments/${encodeURIComponent(c.id)}/status`, {
      method: "POST", body: { status },
    });
    upsertComment(updated);
    renderAll();
  } catch (e) { toast(e.message); }
}

function upsertComment(c) {
  const i = state.comments.findIndex((x) => x.id === c.id);
  if (i >= 0) state.comments[i] = c; else state.comments.push(c);
}

// Highlight a comment: its card, its pin, and its target box.
function lightComment(id, scrollPanel) {
  state.lit = state.lit === id ? null : id;
  applyLit();
  document.querySelectorAll(".pin").forEach((p, i) => {
    const c = screenComments(state.screenId)[i];
    p.classList.toggle("lit", c?.id === state.lit);
  });
  document.querySelectorAll(".thread").forEach((t) => t.classList.toggle("lit", t.dataset.id === state.lit));
  if (scrollPanel && state.lit) document.querySelector(`.thread[data-id="${CSS.escape(state.lit)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function applyLit() {
  const c = state.comments.find((x) => x.id === state.lit);
  const key = c?.target ? itemKey(c.target) : null;
  document.querySelectorAll(".hs").forEach((h) => h.classList.toggle("lit", key != null && h.dataset.key === key));
}

// ---------- Routes ----------
// "/" is the projects home; "/p/<project>/<flow>/<screen>" a screen. Flow ids
// from the API are "<project>/<flow>". Old "#<flow>/<screen>" links still work.
function routeFor(flowId, screen) {
  const segs = String(flowId).split("/").concat(screen ? [screen] : []);
  return "/p/" + segs.map(encodeURIComponent).join("/");
}
function parseRoute() {
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
  const parts = location.pathname.split("/").filter(Boolean).map(dec);
  if (parts[0] === "p" && parts.length >= 3) {
    return { home: false, flow: `${parts[1]}/${parts[2]}`, screen: parts[3] || null };
  }
  if (location.hash.length > 1) {
    const [flow, screen] = location.hash.slice(1).split("/").map(dec);
    return { home: false, flow: flow || null, screen: screen || null };
  }
  return { home: true, flow: null, screen: null };
}
function go(url) {
  if (location.pathname + location.hash !== url) history.pushState(null, "", url);
  route();
}

// ---------- Navigation ----------
function selectScreen(id, { replace = false } = {}) {
  if (id === state.screenId) return;
  state.screenId = id;
  state.lit = null;
  if (state.draft && state.draft.screen !== id) closePopover();
  const url = routeFor(state.flowId, id);
  if (location.pathname !== url) history[replace ? "replaceState" : "pushState"](null, "", url);
  store.set(`fr-screen:${state.flowId}`, id);
  renderAll();
  $("stage").scrollTop = 0;
}

function step(delta) {
  const i = state.order.indexOf(state.screenId);
  const next = state.order[i + delta];
  if (next) selectScreen(next);
}

function renderAll() {
  renderTree();
  renderStage();
  renderThreads();
}

// ---------- Loading ----------
async function loadFlows() {
  state.flows = await api("/api/flows").catch(() => []);
  const pick = $("flowPicker");
  pick.textContent = "";
  // Flows grouped by project (the server addresses them as "<project>/<flow>").
  const groups = new Map();
  for (const f of state.flows) {
    const name = f.project?.name ?? "Flows";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(f);
  }
  for (const [name, flows] of groups) {
    const parent = groups.size > 1 ? el("optgroup") : pick;
    if (parent !== pick) { parent.label = name; pick.appendChild(parent); }
    for (const f of flows) {
      const label = (f.title || f.flow || f.id) + (f.open ? ` (${f.open} open)` : "");
      const o = el("option", null, label);
      o.value = f.id;
      parent.appendChild(o);
    }
  }
  $("flowPickerWrap").hidden = state.flows.length < 2;
  // The picker already names the flow; the plain title is for single-flow setups.
  $("flowTitle").hidden = state.flows.length >= 2;
}

async function loadFlow(id, { keepScreen = true } = {}) {
  const prevFlow = state.flow;
  const prevLatest = prevFlow && keepScreen && state.flowId === id ? latestV(screens()[state.screenId]) : null;
  const data = await api(`/api/flows/${encodeURIComponent(id)}`);
  const switching = state.flowId !== id;
  state.flowId = id;
  state.flow = data.flow;
  state.comments = data.comments ?? [];
  if (switching) { state.versionPick = {}; state.lit = null; closePopover(); }
  $("flowPicker").value = id;
  $("flowTitle").textContent = data.flow.title || id;
  $("crumbProject").textContent = data.project?.name ?? "";
  document.title = `${data.flow.title || id} · Clickthrough`;

  const fromHash = parseRoute();
  let screen = (fromHash.flow === id && screens()[fromHash.screen] && fromHash.screen) ||
    (keepScreen && !switching && screens()[state.screenId] && state.screenId) ||
    (screens()[store.get(`fr-screen:${id}`)] && store.get(`fr-screen:${id}`)) ||
    data.flow.start || Object.keys(screens())[0] || null;
  if (screen && !screens()[screen]) screen = Object.keys(screens())[0] || null;

  // A new version of the screen in view: jump to it and say so.
  const nowLatest = latestV(screens()[screen]);
  if (!switching && screen === state.screenId && prevLatest != null && nowLatest != null && nowLatest > prevLatest) {
    delete state.versionPick[screen];
    toast(`Updated to v${nowLatest}`);
  }

  const stageScroll = $("stage").scrollTop;
  state.screenId = screen;
  if (screen) {
    const url = routeFor(id, screen);
    if (location.pathname !== url) history.replaceState(null, "", url);
  }
  renderAll();
  if (!switching) $("stage").scrollTop = stageScroll;

  // Keep an open popover's draft across the live re-render.
  if (state.draft && !$("popover").hidden) {
    const anchor = state.draft.target
      ? document.querySelector(`.hs[data-key="${CSS.escape(itemKey(state.draft.target))}"]`)
      : $("commentScreen");
    if (anchor) placePopover(anchor); else closePopover();
  }
}

async function route() {
  const r = parseRoute();
  if (r.home) return showHome();
  $("home").hidden = true;
  $("app").hidden = false;
  if (r.flow !== state.flowId) await loadFlows();
  if (!state.flows.some((f) => f.id === r.flow)) {
    // Unknown or moved flow: back to the projects list.
    history.replaceState(null, "", "/");
    return showHome();
  }
  if (r.flow !== state.flowId) await loadFlow(r.flow, { keepScreen: false });
  else if (r.screen && screens()[r.screen] && r.screen !== state.screenId) selectScreen(r.screen, { replace: true });
}

async function showHome() {
  closePopover();
  state.flowId = null;
  state.flow = null;
  $("app").hidden = true;
  $("home").hidden = false;
  document.title = "Clickthrough";
  const [projects, flows] = await Promise.all([
    api("/api/projects").catch(() => []),
    api("/api/flows").catch(() => []),
  ]);
  state.flows = flows;
  const box = $("projects");
  box.textContent = "";
  if (!flows.length) {
    const empty = el("div", "home-empty");
    empty.append(
      el("p", null, "No flows yet. In a project, have your coding agent capture one, or run:"),
      el("pre", null,
        "clickthrough init onboarding --title \"Onboarding\"\n" +
        "clickthrough screen onboarding signup --image signup.png --boxes signup.json\n" +
        "clickthrough serve")
    );
    box.appendChild(empty);
    return;
  }
  for (const p of projects) {
    const mine = flows.filter((f) => f.project?.id === p.id);
    const card = el("section", "project");
    card.append(el("h3", null, p.name), el("p", "dir", p.dir));
    card.querySelector(".dir").title = p.dir;
    if (!mine.length) card.append(el("p", "none", "No flows yet."));
    else {
      const ul = el("ul", "flow-links");
      for (const f of mine) {
        const a = el("a");
        a.href = routeFor(f.id);
        a.dataset.link = "";
        const meta = el("span", "meta", `${f.screens} screens`);
        if (f.open) meta.append(" · ", el("span", "open", `${f.open} open`));
        a.append(el("span", null, f.title || f.flow), meta);
        const li = el("li");
        li.appendChild(a);
        ul.appendChild(li);
      }
      card.append(ul);
    }
    box.appendChild(card);
  }
}

function listen() {
  if (!("EventSource" in window)) return;
  const es = new EventSource("/api/events");
  es.addEventListener("change", async (e) => {
    let data = {};
    try { data = JSON.parse(e.data); } catch { /* ignore */ }
    if (!$("home").hidden) { await showHome(); return; }
    if (!state.flowId) { await route(); return; }
    if (data.flow && data.flow !== state.flowId) { await loadFlows(); $("flowPicker").value = state.flowId; return; }
    try { await loadFlow(state.flowId); } catch { history.replaceState(null, "", "/"); await showHome(); }
  });
}

// ---------- Wire up ----------
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("outline").onchange = (e) => { $("frame").classList.toggle("show", e.target.checked); store.set("fr-outline", e.target.checked ? "1" : ""); };
$("outline").checked = !!store.get("fr-outline");
$("commentScreen").onclick = () => openPopover(null, $("commentScreen"));
document.querySelectorAll("#mode [data-mode]").forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
state.mode = store.get("fr-mode") === "navigate" ? "navigate" : "comment";
document.querySelectorAll("#mode [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
$("popCancel").onclick = closePopover;
$("popSubmit").onclick = submitPopover;
$("popFile").addEventListener("change", (e) => { attachFiles([...e.target.files]); e.target.value = ""; });
$("popText").addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); attachFiles(files); }
});
$("popover").addEventListener("dragover", (e) => { e.preventDefault(); $("popover").classList.add("dragging"); });
$("popover").addEventListener("dragleave", () => $("popover").classList.remove("dragging"));
$("popover").addEventListener("drop", (e) => {
  e.preventDefault();
  $("popover").classList.remove("dragging");
  attachFiles([...(e.dataTransfer?.files ?? [])]);
});
$("popText").addEventListener("input", (e) => { if (state.draft) state.draft.text = e.target.value; });
$("popText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitPopover(); }
  if (e.key === "Escape") closePopover();
});
$("flowPicker").onchange = (e) => go(routeFor(e.target.value));
document.querySelectorAll("[data-filter]").forEach((b) => {
  b.onclick = () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderThreads();
  };
});
const panelOpen = store.get("fr-panel") !== "0";
$("app").classList.toggle("no-panel", !panelOpen);
$("togglePanel").setAttribute("aria-pressed", String(panelOpen));
$("togglePanel").onclick = () => {
  const open = $("app").classList.toggle("no-panel") === false;
  $("togglePanel").setAttribute("aria-pressed", String(open));
  store.set("fr-panel", open ? "1" : "0");
};
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select")) return;
  if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "n" || e.key === "c")) setMode(e.key === "n" ? "navigate" : "comment");
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "Escape") closePopover();
});
document.addEventListener("mousedown", (e) => {
  const pop = $("popover");
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".hs, #commentScreen") && !$("popText").value.trim() && !(state.draft?.images?.length)) closePopover();
});
window.addEventListener("popstate", () => route().catch((e) => toast(e.message)));
window.addEventListener("hashchange", () => route().catch((e) => toast(e.message)));
// In-app links navigate without a page load (modifier-clicks open a new tab as usual).
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute("href"));
});
window.addEventListener("resize", () => { if (!$("popover").hidden) closePopover(); });

route().catch((e) => toast(e.message));
listen();
