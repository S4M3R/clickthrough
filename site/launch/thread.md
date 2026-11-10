# Launch thread (5 posts)

Post 1 carries `demo.mp4`. The others carry the screenshot named under each
one (files in `site/media/`; X takes PNG/JPEG, so use the `.png` copies in
`site/launch/media/`). Alt text is in `alt-text.md`.

---

**1/** (media: demo.mp4)

Telling a coding agent "the second button on the signup page, no, the other one" gets old.

So I built Clickthrough: the agent captures every screen of a flow, I click the component that's wrong and write what should change. The agent fixes it and shows proof.

---

**2/** (media: tree.png)

A flow is a tree, not a slideshow.

"Sign up with GitHub" and "Email and password" are separate branches. So is each integration. Where branches meet again, the tree says "continues at…" instead of repeating screens.

---

**3/** (media: comment.png, navigate.png)

Two modes:

C to comment. Every button, field and heading is a click target. Paste an image if words are not enough.

N to navigate. Click "Stripe" and you are on the Stripe screen, like in the real app.

---

**4/** (media: evidence.png)

The agent runs `clickthrough watch` in the background, so each comment wakes it.

When it is done, the thread says Done and shows the evidence: the new version of the screen, screenshots, the PR link and the checks it ran.

---

**5/**

It is a Node CLI with zero dependencies and a local web page. Flows are JSON and images in your repo. No account, nothing leaves your machine. MIT.

npm install -g clickthrough

https://clickthrough.agustin.build
https://github.com/S4M3R/clickthrough

---

Each post is under 280 characters. Post 5 has two links (23 characters each).
