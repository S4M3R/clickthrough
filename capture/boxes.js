// Evaluate this in the page you just screenshotted (Playwright `page.evaluate`,
// agent-browser `eval`, Chrome DevTools…). It returns a JSON string with every
// visible component's box in page pixels, which `flow-reviews screen --boxes`
// turns into clickable areas on the screenshot.
//
// Take a FULL-PAGE screenshot at the same viewport so the boxes line up, and
// keep the screenshot at device scale 1 (or pass the 1x size): boxes are CSS px.
(() => {
  // Framework dev overlays would show up as components; drop them first.
  document.querySelectorAll("nextjs-portal,[data-nextjs-toast],vite-error-overlay").forEach((e) => e.remove());
  const sel = [
    "h1", "h2", "h3", "h4", "p", "label", "button", "a", "input", "textarea", "select",
    "[role=tab]", "[role=radio]", "[role=checkbox]", "[role=dialog]", "[role=button]",
    "[data-slot=card]", "img", "svg[aria-label]", "li", "pre", "code",
  ].join(",");
  const W = document.documentElement.scrollWidth;
  const H = document.documentElement.scrollHeight;
  const items = [];
  for (const el of document.querySelectorAll(sel)) {
    // Content hidden behind a modal is aria-hidden/inert: not clickable, skip it.
    if (el.closest("[aria-hidden=true],[inert]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;
    const tag = el.tagName.toLowerCase();
    const label = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.innerText ||
      el.getAttribute("alt") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!label && !["input", "textarea", "img", "select"].includes(tag)) continue;
    items.push({
      tag, role: el.getAttribute("role") || "", label,
      x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return JSON.stringify({ url: location.pathname + location.search, vw: innerWidth, W, H, items });
})();
