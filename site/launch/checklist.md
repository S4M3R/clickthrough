# Launch-day checklist

Done so far: the Vercel project has `clickthrough.agustin.build` attached and a
production deploy, and `clickthrough@0.1.0` is on npm. Not done: the DNS
record, the repository settings below, and the post.

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

- [x] `clickthrough@0.1.0` is published (`npm view clickthrough version` prints `0.1.0`).
- [x] Install lines everywhere use `npm install -g clickthrough` and `npx clickthrough`.
- [ ] For the next release: bump `version`, `npm test`, `npm pack --dry-run`, `npm publish`.

### 3. Repository

- [x] The landing-site PR is merged; the README opens with badges and the demo GIF.

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
