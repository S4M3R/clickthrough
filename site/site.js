// Small behaviours for the landing page: copy buttons, the Comment/Navigate
// switch (with the tool's own C and N keys), and the current row in the tree.

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

// Mark the section in view in the tree, as the tool marks the open screen.
const rows = new Map();
for (const a of document.querySelectorAll('.rail a.row[href^="#"]')) rows.set(a.getAttribute("href").slice(1), a);
if (rows.size && "IntersectionObserver" in window) {
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
    const current = [...rows.keys()].find((id) => visible.has(id));
    for (const [id, a] of rows) a.setAttribute("aria-current", String(id === current));
  }, { rootMargin: "-20% 0px -55% 0px" });
  for (const id of rows.keys()) observer.observe(document.getElementById(id));
}

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
