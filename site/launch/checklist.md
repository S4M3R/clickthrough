# Launch-day checklist

Done so far: the Vercel project has `clickthrough.agustin.build` attached and a
production deploy, and `clickthrough@0.1.0` was submitted to npm. Not done: the
DNS record, the release of the staged npm version, and the post.

## Before the post

### 1. Domain

- [x] `clickthrough.agustin.build` is attached to the Vercel project
      (team `s4m3rs-projects`, project `clickthrough`) and production is deployed.
- [ ] Add the DNS record. `agustin.build` is on Cloudflare; run
      `vercel domains verify clickthrough.agustin.build --scope s4m3rs-projects`
      from `site/` and open the Domain Connect link it prints, or add the
      CNAME it asks for by hand.
- [ ] After DNS resolves, check https://clickthrough.agustin.build loads.
- [ ] If you pick another domain, replace `clickthrough.agustin.build` in
      `site/index.html` (canonical, `og:url`, `og:image`, `twitter:image`) and
      in `site/launch/*.md`.

### 2. npm

`clickthrough@0.1.0` was submitted with `npm publish` on 2026-11-10 from the
`s4m3r` account. npm put it in a staged release: the registry shows a
placeholder (`0.0.0-stage`, "awaiting a staged release") until that is released.

- [ ] Open https://www.npmjs.com/package/clickthrough while signed in and
      release the staged `0.1.0` if npm asks for it.
- [ ] Confirm: `npm view clickthrough version` prints `0.1.0`, and
      `npx clickthrough help` prints the usage.
- [ ] Only then switch the install line everywhere to `npm install -g clickthrough`
      (and `npx clickthrough`): `README.md`, `AGENTS.md`, `site/index.html`
      (three commands and their `data-copy` attributes),
      `site/launch/post.md`, `site/launch/thread.md`. Redeploy the site.

### 3. Repository

- [ ] Merge the landing-site PR, so the demo GIF at the top of the README and
      the `site/demo` link on the landing page resolve on `main`.
- [ ] Badges under the README title (after the npm publish):

      ```markdown
      [![npm](https://img.shields.io/npm/v/clickthrough)](https://www.npmjs.com/package/clickthrough)
      [![license](https://img.shields.io/github/license/S4M3R/clickthrough)](LICENSE)
      [![node](https://img.shields.io/node/v/clickthrough)](package.json)
      ```

- [ ] Website and topics:

      ```bash
      gh repo edit S4M3R/clickthrough \
        --homepage https://clickthrough.agustin.build \
        --add-topic coding-agents --add-topic design-review --add-topic ux-review \
        --add-topic screenshots --add-topic claude-code --add-topic codex \
        --add-topic cursor --add-topic cli --add-topic developer-tools
      ```

- [ ] Social preview: repo Settings, General, Social preview, upload `site/launch/og.png`.
- [ ] A pinned issue for feedback:

      ```bash
      gh issue create --repo S4M3R/clickthrough \
        --title "Feedback: what broke, what is missing" \
        --body "Tried Clickthrough? Say which agent you used, what flow you captured, and where it got stuck. Screenshots of the review page help (not of private products)."
      gh issue pin <number> --repo S4M3R/clickthrough
      ```

### 4. Check the card and the media

- [ ] Open the production URL on a phone and on a laptop. Play the video.
- [ ] Paste the URL into the X composer (do not post) and check the card
      shows `og.png` with the headline.
- [ ] Watch `site/media/demo.mp4` once more. It is 39 seconds, 1632x1200, H.264, no audio.

## The post

- [ ] Pick one: the single post (`post.md`) or the thread (`thread.md`).
- [ ] Upload `demo.mp4` to the first post as a video. Add its alt text from `alt-text.md`.
- [ ] Thread only: attach the PNGs from `site/launch/media/` to posts 2 to 4, with alt text.
- [ ] Post. Pin it to your profile.

## After the post

- [ ] Reply to questions with specifics (which agent, which command).
- [ ] Add the link to the post in the pinned issue, so feedback has one place to land.
- [ ] Note what people ask for in the first day; that is the next README section.
