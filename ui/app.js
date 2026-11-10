// Flow Reviews web UI. Talks to the local `flow-reviews serve` API (see SPEC.md).
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
    empty.append(el("pre", null, `flow-reviews screen ${state.flowId} ${id || "<screen>"} --image shot.png --boxes boxes.json`));
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
    h.setAttribute("aria-label", `Comment on ${targetLabel(it)}`);
    h.addEventListener("mouseenter", (e) => showTip(e, it));
    h.addEventListener("mousemove", moveTip);
    h.addEventListener("mouseleave", hideTip);
    h.addEventListener("click", () => openPopover(it, h));
    h.tabIndex = 0;
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
    "flow-reviews init onboarding --title \"Onboarding\" --start signup\n" +
    "flow-reviews screen onboarding signup --image signup.png --boxes signup.json --title \"Sign up\"\n" +
    "flow-reviews edge onboarding signup verify --label \"Continue with email\""));
}

const itemKey = (it) => `${it.x},${it.y},${it.w},${it.h}`;

function showTip(e, it) {
  const t = $("tip");
  t.textContent = "";
  t.append(el("span", "k", it.k), document.createTextNode(it.l || "(no text)"));
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
  state.draft = { screen: state.screenId, target, text: keep ? state.draft.text : "" };
  const pop = $("popover");
  $("popTarget").textContent = targetLabel(target);
  $("popText").value = state.draft.text;
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
async function submitPopover() {
  const d = state.draft;
  const text = $("popText").value.trim();
  if (!d || !text) return;
  const scr = screens()[d.screen];
  const v = currentVersion(scr, d.screen);
  $("popSubmit").disabled = true;
  try {
    const c = await api(`/api/flows/${encodeURIComponent(state.flowId)}/comments`, {
      method: "POST",
      body: { screen: d.screen, version: v?.v ?? null, target: d.target, text },
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
    if (c.status === "resolved") head.appendChild(el("span", "status-ok", "Resolved"));
    card.appendChild(head);

    card.appendChild(message(c.author, c.text));
    if (c.replies?.length) {
      const reps = el("div", "replies");
      for (const r of c.replies) reps.appendChild(message(r.author, r.text));
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

// ---------- Navigation ----------
function selectScreen(id, { replace = false } = {}) {
  if (id === state.screenId) return;
  state.screenId = id;
  state.lit = null;
  if (state.draft && state.draft.screen !== id) closePopover();
  const hash = `#${encodeURIComponent(state.flowId)}/${encodeURIComponent(id)}`;
  if (location.hash !== hash) history[replace ? "replaceState" : "pushState"](null, "", hash);
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
  for (const f of state.flows) {
    const o = el("option", null, f.title || f.id);
    o.value = f.id;
    pick.appendChild(o);
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
  document.title = `${data.flow.title || id} · Flow Reviews`;

  const fromHash = parseHash();
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
    const hash = `#${encodeURIComponent(id)}/${encodeURIComponent(screen)}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
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

function parseHash() {
  const [flow, screen] = location.hash.slice(1).split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  return { flow: flow || null, screen: screen || null };
}

async function boot() {
  await loadFlows();
  if (!state.flows.length) { state.flow = null; renderAll(); return; }
  const h = parseHash();
  const id = state.flows.some((f) => f.id === h.flow) ? h.flow : state.flows[0].id;
  await loadFlow(id, { keepScreen: false });
}

function listen() {
  if (!("EventSource" in window)) return;
  const es = new EventSource("/api/events");
  es.addEventListener("change", async (e) => {
    let data = {};
    try { data = JSON.parse(e.data); } catch { /* ignore */ }
    if (!state.flowId) { await boot(); return; }
    if (data.flow && data.flow !== state.flowId) { await loadFlows(); $("flowPicker").value = state.flowId; return; }
    try { await loadFlow(state.flowId); } catch { await boot(); }
  });
}

// ---------- Wire up ----------
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("outline").onchange = (e) => { $("frame").classList.toggle("show", e.target.checked); store.set("fr-outline", e.target.checked ? "1" : ""); };
$("outline").checked = !!store.get("fr-outline");
$("commentScreen").onclick = () => openPopover(null, $("commentScreen"));
$("popCancel").onclick = closePopover;
$("popSubmit").onclick = submitPopover;
$("popText").addEventListener("input", (e) => { if (state.draft) state.draft.text = e.target.value; });
$("popText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitPopover(); }
  if (e.key === "Escape") closePopover();
});
$("flowPicker").onchange = (e) => { history.replaceState(null, "", `#${encodeURIComponent(e.target.value)}`); loadFlow(e.target.value, { keepScreen: false }); };
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
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "Escape") closePopover();
});
document.addEventListener("mousedown", (e) => {
  const pop = $("popover");
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".hs, #commentScreen") && !$("popText").value.trim()) closePopover();
});
window.addEventListener("hashchange", () => {
  const h = parseHash();
  if (h.flow && h.flow !== state.flowId && state.flows.some((f) => f.id === h.flow)) loadFlow(h.flow, { keepScreen: false });
  else if (h.screen && screens()[h.screen] && h.screen !== state.screenId) selectScreen(h.screen, { replace: true });
});
window.addEventListener("resize", () => { if (!$("popover").hidden) closePopover(); });

boot().catch((e) => toast(e.message));
listen();
