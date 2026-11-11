# Clickthrough: guide for coding agents

You are helping a person review a product flow. Your job:

1. Capture every screen of the flow, including every branch, with its
   component boxes.
2. Wire the screens into a flow graph with labeled edges.
3. Start the review server and give the person the URL.
4. Watch for comments, make the changes in the code, re-capture the affected
   screens as new versions, reply on each thread, and resolve it.

Run the CLI as `clickthrough <command>` if it is installed
(`npm install -g clickthrough`), else
`npx clickthrough <command>`. Run it from the project's root:
flows are stored in `./.clickthrough/` there (or pass `--dir`, or
`--project <id>` for a registered project). `clickthrough init` registers the
project, so the person's `clickthrough` home page lists it with their other
projects.
Suggest adding `.clickthrough/` to `.gitignore`; it holds product screenshots.

## 1. Capture a screen

For each state worth reviewing:

1. Drive the app to that state with your browser tool (Playwright,
   agent-browser, Chrome DevTools MCP, …). Use a fixed viewport, for example
   1440x900, and the same one for the whole flow.
2. Measure the components: evaluate the script printed by
   `clickthrough boxes-script` (file `capture/boxes.js`) in the page and save
   the returned string to a file, e.g. `signup.json`.
3. Take a full-page screenshot at device scale 1, e.g. `signup.png`. Boxes are
   CSS pixels, so a 2x screenshot will not line up.
4. Add it:

```bash
clickthrough screen <flow> <screen-id> --image signup.png --boxes signup.json \
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
clickthrough edge <flow> signup verify --label "Email and password" --via "Create account"
clickthrough edge <flow> signup google --label "Sign up with Google" --via "Sign up with Google"
clickthrough edge <flow> connect connect-stripe --label "Stripe" --via "Stripe"
```

`--via` is the visible text of the component the user clicks to get there (a
prefix is enough: "Import" matches "Import 3 agents"). The reviewer's Navigate
mode follows it, so they can click through the screens like the real app. Give
every edge a `--via` when a component triggers it.

- One edge per real choice. Integrations, sign-in methods, plan types, roles,
  empty vs full accounts: each is its own branch.
- When branches end on the same screen, add edges to that screen; the UI shows
  "continues at …" rather than duplicating it.
- `clickthrough init <flow> --start <screen>` sets the first screen (otherwise
  the first screen you added).
- If a branch needs credentials you do not have, or passes through a third-party
  page (Google sign-in, Stripe checkout), capture as far as you can and add a
  clearly labeled placeholder screen for the part you cannot capture, so the
  branch still reads end to end. Say what it stands for in `--note`.

## 3. Start the review

```bash
clickthrough serve --port 4777
```

Run it in the background and give the person the URL of the first screen,
`http://localhost:4777/p/<project>/<flow>/<screen>` (the project id is printed by
`init` and listed by `clickthrough projects`). If a server is already running on
that port it is serving every registered project, including this one: reuse it.

## 4. Work through comments

Watch in the background, so each comment reaches you as it is written:

```bash
clickthrough watch [<flow>]     # one JSON line per new reviewer comment or reply
clickthrough watch --all        # every registered project (lines include "project")
```

A comment can carry images the reviewer pasted or dropped (a reference, a
sketch, the bug). They arrive as absolute file paths in `images` (and as
`imageFiles` in `clickthrough comments`): open them before you start.

Each line looks like:

```json
{"type":"comment","flow":"onboarding","comment":"c_1a2b3c","screen":"signup","version":2,"target":"Button: Continue with GitHub","text":"Put GitHub first"}
```

- Claude Code / T3 Code: run `watch` with the Monitor tool (or a background
  command whose output you are notified about). Each line wakes you.
- Other agents: poll `clickthrough comments --open` between tasks.

For each comment:

1. Find the code behind `target` on `screen` (the route and the label are your
   best leads) and make the change. If it is a question, answer it.
2. Re-capture the affected screens as a new version with a note saying what
   changed:
   `clickthrough screen <flow> <screen> --image … --boxes … --note "GitHub button first"`.
   The open page switches to it on its own.
3. Close it with evidence, in plain words, so the person can check your work
   without asking:

   ```bash
   clickthrough done <flow> <comment-id> "Swapped the buttons: GitHub is first." \
     --version signup                 # the screen version that shows it (latest; or signup@3)
     --image after.png                # optional screenshot (repeatable)
     --link https://github.com/o/r/pull/12 --label "PR #12"
     --check "pnpm test: 49 passed"   # checks you actually ran (repeatable)
   ```

   `done` adds your reply with the evidence and hands the thread to the person:
   they see it under Changes as "To check" and either accept it or reply. You
   do not wait for that; carry on with the next comment. Only list checks you
   ran and links that exist. Use `reply` (no evidence, thread
   stays open) for questions and progress notes, and `resolve` only for threads
   that need no change.
4. If the request is ambiguous or asks for options, reply with what you need or
   with the options (capture each option as its own screen or version) and leave
   the thread open.

A reply from the person reopens a finished thread and shows up in `watch` again:
they checked your change and it is not right yet.
