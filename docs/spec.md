# Clickthrough: data format, API and tree rules

Local-first tool to review a product flow screen by screen. An agent captures
screens (screenshot + element boxes) and wires them into a flow graph; a human
opens the local web UI, walks the flow's branches, clicks any component and
leaves a comment; the agent reads comments (or is woken by `clickthrough watch`),
changes the code, re-captures, and replies/resolves.

Zero runtime dependencies. Node >= 18. ESM.

## Data layout (inside the user's project)

```
.clickthrough/                 (default --dir; configurable)
  <flow-id>/
    flow.json
    comments.json
    shots/<screen-id>-v<n>.<ext>
```

### flow.json

```json
{
  "id": "acme-onboarding",
  "title": "Acme onboarding",
  "start": "welcome",
  "screens": {
    "welcome": {
      "title": "Choose how to sign up",
      "route": "/signup",
      "versions": [
        {
          "v": 1,
          "image": "shots/welcome-v1.png",
          "W": 1440, "H": 900,
          "note": "What changed in this version (empty for v1)",
          "at": "2026-11-10T20:00:00.000Z",
          "items": [ { "k": "Button", "l": "Sign up manually", "x": 168, "y": 391, "w": 384, "h": 76 } ]
        }
      ]
    }
  },
  "edges": [
    { "from": "welcome", "to": "form", "label": "Sign up manually", "via": "Sign up manually" },
    { "from": "welcome", "to": "agent-signup", "label": "Sign up with an agent" }
  ]
}
```

- `items` are component boxes in image pixel space (W x H). Sorted largest area
  first so smaller ones render on top. `k` = kind (Button, Link, Input, Heading,
  Text, Label, Image, List item, Code, Tab, Checkbox, Radio, Dialog, Card…),
  `l` = visible label.
- The latest version is the last array entry.

### comments.json

```json
[
  {
    "id": "c_k3j2h1",
    "screen": "welcome",
    "version": 1,
    "target": { "k": "Button", "l": "Sign up manually", "x": 168, "y": 391, "w": 384, "h": 76 },
    "text": "Drop this chooser",
    "author": "reviewer",
    "status": "open",
    "createdAt": "ISO",
    "replies": [ { "author": "agent", "text": "Done in v2", "at": "ISO" } ]
  }
]
```

`via` (optional) is the visible text of the component that triggers the edge.
Navigate mode makes a component clickable when its label equals or starts with
an outgoing edge's `via` (or, for edges without `via`, its `label`).

Replies written by `clickthrough done` carry `evidence`, and the comment gets
`resolvedBy: "agent"` and `resolvedAt`:

```json
{ "author": "agent", "text": "Made it blue", "at": "ISO", "evidence": [
  { "type": "version", "screen": "signup", "v": 3 },
  { "type": "image", "path": "evidence/c_k3j2h1-a1b2c3.png" },
  { "type": "link", "url": "https://github.com/o/r/pull/12", "label": "PR #12" },
  { "type": "check", "text": "npm test: 12 passed" }
] }
```

Evidence images live in the flow folder under `evidence/` and are served from
`/files/<project>%2F<flow>/evidence/…`. Links must be http(s).

`target` may be null (comment on the whole screen). `status`: `open` | `resolved`.

A comment the agent finished waits for the reviewer's check: it is "to check"
while `status` is `resolved`, `resolvedBy` is `agent` and there is no
`confirmedAt`. The reviewer's "Looks good" sets `confirmedAt` (ISO time).
Reopening the thread (a reviewer reply, or status `open`) removes it, and so
does a later `clickthrough done`. A thread the reviewer resolves by hand gets
`resolvedBy: "reviewer"` and needs no check.

## Tree derivation (UI)

The flow is a directed graph. The left nav renders it as a branch tree:

- Walk from `start`. A run of single-outgoing-edge screens is shown as a flat
  sequence (numbered within its branch).
- At a fork (node with >1 outgoing edges), render one collapsible **branch** per
  edge, labeled with the edge label, containing that continuation.
- When a walk reaches a screen already rendered elsewhere, render a muted
  "↪ continues at <title>" row that jumps there, instead of repeating it.
- Screens not reachable from `start` go in an "Unlinked" group at the bottom.
- Each screen row shows an open-comment count badge.

The sidebar switches between this tree ("Screens") and "Changes": the comments
the agent finished, the ones still to check first, then the checked ones. Each
is a card with its state, the agent's reply, the component and the versions
(`v1 → v2`), and a "Looks good" button while it waits. Opening one shows the
screen before and after, side by side: "before" is the version the comment was
left on (with the commented component outlined), "after" is the version in the
agent's evidence. Without version evidence, or when both are the same version,
the single screen is shown. Accepting a change opens the next one that waits.
Keys in this view: `↑`/`↓` (or `K`/`J`) pick a change, `Y` or `Enter` accepts
it, `R` focuses the reply, `Esc` goes back to the single screen. The comments
panel's "Open" filter lists open threads and finished ones not checked yet.
- Selecting a screen remembers the branch path in the URL hash `#<screen-id>`.

Versions are NOT tree nodes: the screen toolbar has a version control
(v1 … vN, latest default) and shows the version note.

## Projects

A project is `{id, name, dir}` in `~/.config/clickthrough/projects.json`
(`$CLICKTHROUGH_HOME` overrides the folder). `dir` is the project's flows folder.
`clickthrough serve` serves every registered project (re-read on each listing);
`--dir` / `--project` serve just one. In the API a flow is addressed by the key
`<project>/<flow>`, URL-encoded as one path segment (`web%2Fonboarding`).

## Web routes

- `/`: projects home (every project and its flows, with screen, open comment
  and to-check counts).
- `/p/<project>/<flow>/<screen>`: a screen. Older `#<key>/<screen>` links still
  resolve.

## HTTP API (served by `clickthrough serve`, default port 4777)

| Method | Path | Body / result |
|---|---|---|
| GET | `/api/projects` | `[{id,name,dir,flows:<count>}]` |
| GET | `/api/flows` | `[{id:"<project>/<flow>",flow,title,project:{id,name},screens:<count>,open:<open comments>,review:<finished, to check>}]` |
| GET | `/api/flows/:id` | `{flow, comments, project}` |
| POST | `/api/flows/:id/attachments` | raw image bytes (PNG/JPEG/WebP/GIF, ≤10 MB) → `{path, url}` |
| POST | `/api/flows/:id/comments` | `{screen, version, target|null, text, images?: [path]}` → comment |
| POST | `/api/flows/:id/comments/:cid/replies` | `{text, images?, author?}` (author defaults `reviewer`) → comment |
| POST | `/api/flows/:id/comments/:cid/status` | `{status}` → comment (resolving here records `resolvedBy: "reviewer"`) |
| POST | `/api/flows/:id/comments/:cid/confirm` | the reviewer accepts a finished comment → comment with `confirmedAt` |
| GET | `/api/events` | SSE; event `change` data `{"flow":"<project>/<flow>"}` whenever a flow dir changes |
| GET | `/files/:id/<path>` | static files inside the flow dir (shots) |
| GET | `/` and `/ui/*` | the web UI (`ui/index.html`, `ui/app.js`, `ui/styles.css`) |

All JSON. Errors: `{error}` with 4xx/5xx.

## CLI (`clickthrough`)

```
clickthrough                                     # = serve --open, every project
clickthrough serve   [--port 4777] [--open] [--dir … | --project …]
clickthrough projects [add [<id>] [--dir] [--name] | remove <id>]
clickthrough init    <flow> --title "Acme onboarding" [--start <screen>]
clickthrough screen  <flow> <screen> --image shot.png [--boxes boxes.json] [--title ..] [--route ..] [--note "what changed"]
clickthrough edge    <flow> <from> <to> --label "Sign up with Google" [--via "Sign up with Google"]
clickthrough comments [<flow>] [--open]          # JSON to stdout
clickthrough reply   <flow> <comment-id> "text"   # author: agent
clickthrough done    <flow> <comment-id> "text" [--version <screen>[@v]] [--image f] [--link url --label l] [--check "…"]
clickthrough resolve <flow> <comment-id> [--reopen]
clickthrough watch   [<flow>] [--all]             # one JSON line per new reviewer comment/reply; never exits
clickthrough boxes-script                          # prints the path of capture/boxes.js
```

`--boxes` takes the JSON string produced by evaluating `capture/boxes.js` in the
page (`{url,vw,W,H,items:[{tag,role,label,x,y,w,h}]}`); the CLI converts it into
`items` (`k`/`l`), drops duplicates and off-canvas boxes, and sorts by area.
