# T3 Flow Reviews

Review a product flow screen by screen, then hand the comments to your coding
agent.

An agent walks your app (signup, onboarding, checkout…) and captures every
screen with the position of each component. You open a local page, follow the
flow's branches in a tree, click any button, field or heading, and write what
should change. The agent reads your comments, changes the code, re-captures the
screens and replies on each thread. New versions show up live, with the
previous ones a click away.

![Flow Reviews showing a signup flow with branches and a comment thread](docs/screenshot.png)

- **Branches, not a list.** A flow is a graph: "Sign up with Google" and "Email
  and password" are separate branches, and so is each integration you can
  connect. Where branches meet again, the tree says so instead of repeating
  screens.
- **Comment on the component, not the screenshot.** Every component is a click
  target, so a comment says "Button: Continue with GitHub", not "somewhere top
  left".
- **Versions per screen.** Each re-capture is a new version with a note on what
  changed; switch between them in the toolbar.
- **Local and plain files.** Flows live in `.flow-reviews/` in your project as
  JSON and images. No account, no cloud, no runtime dependencies.
- **Made for agents.** A small CLI to add screens and edges, read comments,
  reply and resolve, and a `watch` command that prints each new comment as one
  line, so an agent running it in the background is woken by your comments.

## Try it

Needs Node 18 or newer.

```bash
git clone https://github.com/S4M3R/T3-flow-reviews
cd T3-flow-reviews
npm start            # serves the demo flow in examples/ at http://localhost:4777
```

Or run it in any project without cloning:

```bash
npx github:S4M3R/T3-flow-reviews serve --open
```

## Use it with your coding agent

Tell your agent (Claude Code, Codex, Cursor, T3 Code…):

> Read https://github.com/S4M3R/T3-flow-reviews/blob/main/AGENTS.md, then capture
> our signup and onboarding flow with every branch, start the review server and
> watch for my comments.

[AGENTS.md](AGENTS.md) is written for the agent: how to capture a screen and its
components, how to wire branches, and how to work through comments.

## By hand

```bash
# 1. A flow
npx github:S4M3R/T3-flow-reviews init onboarding --title "Onboarding"

# 2. Screens: a screenshot, plus the component boxes measured in the page
#    (evaluate capture/boxes.js in the page and save its output)
flow-reviews screen onboarding signup --image signup.png --boxes signup.json --title "Create your account"
flow-reviews screen onboarding verify --image verify.png --boxes verify.json --title "Check your email"

# 3. Branches
flow-reviews edge onboarding signup verify --label "Email and password"

# 4. Review
flow-reviews serve --open

# 5. Read and answer comments
flow-reviews comments onboarding --open
flow-reviews reply onboarding c_1a2b3c "Moved it above the form"
flow-reviews resolve onboarding c_1a2b3c
```

`flow-reviews help` lists every command. Flows default to `./.flow-reviews`;
pass `--dir` or set `FLOW_REVIEWS_DIR` to put them elsewhere.

## Privacy

Screenshots of your product stay on your machine, in your project. The server
listens on `127.0.0.1` only. Add `.flow-reviews/` to your `.gitignore` if the
screens should not be committed.

## Reference

- [docs/spec.md](docs/spec.md): file format, HTTP API, and how the branch tree is
  built.
- `npm test` runs the test suite (Node's built-in runner).

MIT licensed.
