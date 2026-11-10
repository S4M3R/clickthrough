# Flow Reviews: guide for coding agents

You are helping a person review a product flow. Your job:

1. Capture every screen of the flow, including every branch, with its
   component boxes.
2. Wire the screens into a flow graph with labeled edges.
3. Start the review server and give the person the URL.
4. Watch for comments, make the changes in the code, re-capture the affected
   screens as new versions, reply on each thread, and resolve it.

Run the CLI with `npx github:S4M3R/T3-flow-reviews <command>` (or
`node <clone>/bin/cli.mjs <command>`). Below it is written as `flow-reviews`.
Flows are stored in `./.flow-reviews/` in the project unless `--dir` is given.
Suggest adding `.flow-reviews/` to `.gitignore`; it holds product screenshots.

## 1. Capture a screen

For each state worth reviewing:

1. Drive the app to that state with your browser tool (Playwright,
   agent-browser, Chrome DevTools MCP, …). Use a fixed viewport, for example
   1440x900, and the same one for the whole flow.
2. Measure the components: evaluate the script printed by
   `flow-reviews boxes-script` (file `capture/boxes.js`) in the page and save
   the returned string to a file, e.g. `signup.json`.
3. Take a full-page screenshot at device scale 1, e.g. `signup.png`. Boxes are
   CSS pixels, so a 2x screenshot will not line up.
4. Add it:

```bash
flow-reviews screen <flow> <screen-id> --image signup.png --boxes signup.json \
  --title "Create your account" --route /signup
```

Screen ids are short slugs (`signup`, `connect-stripe`). Titles are what the
person sees in the tree. Use realistic test data, never real customer data.

Capture the states a reviewer cares about, not every keystroke: an empty form
and a filled one, an open dialog, an error, an empty list and a long one.

## 2. Wire the branches

Each user choice that leads somewhere different is an edge with a label in the
user's words:

```bash
flow-reviews edge <flow> signup verify --label "Email and password"
flow-reviews edge <flow> signup workspace --label "Google or GitHub"
flow-reviews edge <flow> connect connect-stripe --label "Stripe"
flow-reviews edge <flow> connect connect-postgres --label "Postgres"
```

- One edge per real choice. Integrations, sign-in methods, plan types, roles,
  empty vs full accounts: each is its own branch.
- When branches end on the same screen, add edges to that screen; the UI shows
  "continues at …" rather than duplicating it.
- `flow-reviews init <flow> --start <screen>` sets the first screen (otherwise
  the first screen you added).
- If a branch needs credentials you do not have, capture as far as you can and
  say in the screen's `--note` where it stops.

## 3. Start the review

```bash
flow-reviews serve --port 4777
```

Run it in the background and give the person `http://localhost:4777`.

## 4. Work through comments

Watch in the background, so each comment reaches you as it is written:

```bash
flow-reviews watch [<flow>]     # one JSON line per new reviewer comment or reply
```

Each line looks like:

```json
{"type":"comment","flow":"onboarding","comment":"c_1a2b3c","screen":"signup","version":2,"target":"Button: Continue with GitHub","text":"Put GitHub first"}
```

- Claude Code / T3 Code: run `watch` with the Monitor tool (or a background
  command whose output you are notified about). Each line wakes you.
- Other agents: poll `flow-reviews comments --open` between tasks.

For each comment:

1. Find the code behind `target` on `screen` (the route and the label are your
   best leads) and make the change. If it is a question, answer it.
2. Re-capture the affected screens as a new version with a note saying what
   changed:
   `flow-reviews screen <flow> <screen> --image … --boxes … --note "GitHub button first"`.
   The open page switches to it on its own.
3. Reply in plain words with what you did, then resolve:
   `flow-reviews reply <flow> <comment-id> "Swapped the buttons; see v3."`
   `flow-reviews resolve <flow> <comment-id>`
4. If the request is ambiguous or asks for options, reply with what you need or
   with the options (capture each option as its own screen or version) and leave
   the thread open.

A reply from the person reopens a resolved thread and shows up in `watch` again.
