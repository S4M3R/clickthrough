// Small behaviours for the landing page: copy buttons, the Comment/Navigate
// switch (with the tool's own C and N keys), the install button and the star count.

for (const button of document.querySelectorAll(".copy")) {
  const label = button.textContent;
  button.addEventListener("click", async () => {
    const from = button.dataset.copyFrom;
    const text = from ? document.getElementById(from).textContent.trim() : button.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      button.classList.add("ok");
    } catch {
      button.textContent = "Press Ctrl+C";
    }
    setTimeout(() => { button.textContent = label; button.classList.remove("ok"); }, 1600);
  });
}

const modeButtons = document.querySelectorAll(".seg [data-mode]");
function setMode(mode) {
  for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  for (const panel of document.querySelectorAll(".mode")) panel.hidden = panel.dataset.for !== mode;
}
for (const b of modeButtons) b.addEventListener("click", () => setMode(b.dataset.mode));
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea, select, video")) return;
  if (e.key === "c" || e.key === "n") setMode(e.key === "n" ? "navigate" : "comment");
});

// Star count next to the repository link, when GitHub answers.
fetch("https://api.github.com/repos/S4M3R/clickthrough")
  .then((r) => (r.ok ? r.json() : null))
  .then((repo) => {
    const el = document.getElementById("stars");
    if (!el || !repo || !(repo.stargazers_count >= 10)) return; // a handful of stars says nothing yet
    el.textContent = `★ ${repo.stargazers_count.toLocaleString("en")}`;
    el.hidden = false;
  })
  .catch(() => {});

// People who asked for less motion get a still frame and the play button.
const demo = document.getElementById("demo");
if (demo && matchMedia("(prefers-reduced-motion: reduce)").matches) {
  demo.removeAttribute("autoplay");
  demo.pause();
}

// On phones the wide screenshots scroll sideways; start them on the middle, where the action is.
for (const pan of document.querySelectorAll(".pan")) {
  const centre = () => { if (pan.scrollWidth > pan.clientWidth) pan.scrollLeft = (pan.scrollWidth - pan.clientWidth) / 2; };
  const img = pan.querySelector("img");
  img.complete ? centre() : img.addEventListener("load", centre);
}

// The install button names one agent at a time. A click copies the setup prompt
// and says where to paste it.
const AGENTS = [
  ["Claude Code", "claude-code.svg"], ["Codex", "codex.svg"], ["Cursor", "cursor.svg"],
  ["OpenCode", "opencode.png"], ["T3 Code", "t3-code.png"], ["Orca", "orca.png"], ["Conductor", "conductor.png"],
];
for (const [, file] of AGENTS) new Image().src = `media/agents/${file}`; // so a logo is there when its turn comes
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
let agent = 0;
const installs = [...document.querySelectorAll(".install")];
const showAgent = (animate) => {
  for (const b of installs) {
    if (b.classList.contains("ok")) continue;
    const name = document.createElement("span");
    const logo = new Image(22, 22);
    logo.src = `media/agents/${AGENTS[agent][1]}`;
    logo.alt = "";
    name.append(logo, AGENTS[agent][0]);
    if (animate) name.className = "in";
    b.querySelector(".rotor").replaceChildren(name);
  }
};
if (installs.length && !still) setInterval(() => { agent = (agent + 1) % AGENTS.length; showAgent(true); }, 2200);
for (const b of installs) {
  const html = b.innerHTML;
  b.addEventListener("click", async () => {
    const text = document.getElementById(b.dataset.copyFrom).textContent.trim();
    const name = AGENTS[agent][0];
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = `Prompt copied. Paste it into ${name}`;
    } catch {
      b.textContent = "Could not copy. Open “See the prompt” below";
    }
    b.classList.add("ok");
    setTimeout(() => { b.classList.remove("ok"); b.innerHTML = html; showAgent(false); }, 2600);
  });
}
