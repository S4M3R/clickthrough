# Demo

Builds two synthetic projects, records the demo video and takes the
screenshots for the landing page. Everything on screen is a made-up product
("Acme", defined in `app.mjs`); the tool is the real one from this repo.

```bash
cd site/demo
npm install            # Playwright, only used here
npx playwright install chromium
npm run all            # flows -> recording -> flows again -> stills
```

Needs `ffmpeg` for the video and GIF. Output goes to `site/media/` and
`site/og.png`. Work files live in `.work/` (ignored by git), with their own
project registry, so your real Clickthrough projects are not touched.

| File | What it does |
|---|---|
| `app.mjs` | The synthetic screens and the edges between them. |
| `build-flows.mjs` | Captures every screen and builds the flows with the CLI (`init`, `screen`, `edge`). |
| `agent.sh` | The agent's side: captures the changed screen, then runs `clickthrough screen` and `clickthrough done` with evidence. |
| `record.mjs` | Drives the review UI as a reviewer, runs `clickthrough watch` and `agent.sh`, writes `demo.mp4`, `demo.gif`, `demo-poster.jpg`. |
| `shots.mjs` | Stills for the page; ends by running `og.mjs`. |
| `build-example.mjs` | Rebuilds `examples/`, the flow `clickthrough demo` serves (`npm run example`). |
| `og.mjs` | Renders the social image from `og.html` (`npm run og`). |
| `preview.mjs` | Screenshots of the landing page at desktop, tablet and phone widths. |

What is scripted and what is real:

- The reviewer is a script (Playwright moving a pointer and typing).
- The terminal strip in the video prints the real output of `clickthrough watch`
  and the commands `agent.sh` runs.
- The "code change" is a ready-made variant of the signup screen. The PR link
  (`example.com`) and the test count are sample values, because Acme does not
  exist.
- Absolute paths are shown as `~/code/...` so the recording does not show the
  home folder of the machine that made it.
