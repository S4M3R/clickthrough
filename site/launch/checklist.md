# Launch-day checklist

Nothing here has been done for you: no post was sent, nothing was published
to npm, and no domain or DNS record was changed.

## Before the post

### 1. Domain

- [ ] Approve the subdomain. Proposed: `clickthrough.agustin.build` (same
      pattern as `relay.agustin.build` and `cleanly.agustin.build`).
- [ ] Add it to the Vercel project (team `s4m3rs-projects`, project `clickthrough`):

      ```bash
      cd site
      vercel domains add clickthrough.agustin.build --scope s4m3rs-projects
      ```

- [ ] `agustin.build` uses third-party nameservers, so add the DNS record at
      the DNS provider: `CNAME clickthrough -> cname.vercel-dns.com` (use the
      exact value `vercel domains inspect clickthrough.agustin.build` prints).
- [ ] Deploy to production: `vercel deploy --prod --scope s4m3rs-projects`
      (from `site/`).
- [ ] If you pick another domain, replace `clickthrough.agustin.build` in
      `site/index.html` (canonical, `og:url`, `og:image`, `twitter:image`) and
      in `site/launch/*.md`.

### 2. npm

`clickthrough` was free on npm when checked (`npm view clickthrough` returned 404).

- [ ] Check again: `npm view clickthrough`
- [ ] Look at what ships: `npm pack --dry-run` (12 files, about 35 kB; `site/` is not included)
- [ ] `npm test`
- [ ] `npm publish --access public`
- [ ] Then switch the install line everywhere to `npm install -g clickthrough`
      (and `npx clickthrough`): `README.md`, `AGENTS.md`, `site/index.html`
      (four places: three commands and the `data-copy` attributes),
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
