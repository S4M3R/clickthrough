# Changelog

## 0.2.0

The reviewer now has the last word on every change.

- **Changes view.** The sidebar switches between Screens (the branch tree) and
  Changes: every comment by where it stands. "To check" is what the agent
  finished, "In progress" is what it is working on or has asked you about, and
  "Checked" collapses into one row at the bottom.
- **Finished is not closed.** After `clickthrough done`, a comment waits as
  "To check" until you click "Looks good" (or press `Y`). A reply still sends it
  back to the agent.
- **Before and after.** Opening a change shows the version you commented on
  next to the version the agent delivered, with your comment, the agent's reply
  and the decision underneath. Agents: pass `--version` to `done` for this.
- **A queue with keys.** Accepting a change opens the next one. `↑`/`↓` or
  `K`/`J` pick a change, `Y` or `Enter` accepts, `R` replies, `Esc` returns to
  the single screen.
- **Images on replies.** Paste, drop or attach images when you reply, as on a
  new comment. A half-written reply survives live updates of the page.
- **New look.** Violet selection colour in light and dark, a favicon, and a
  lighter sidebar header.
- A comment's highlight box only shows on the version it was left on.
- The page tells you when the agent finishes something while it is open.

Data and API changes are additive: `confirmedAt` on a comment,
`POST /api/flows/:id/comments/:cid/confirm`, `review` on `/api/flows` rows, and
`resolvedBy: "reviewer"` when you resolve a thread yourself. Flows made with
0.1.0 work unchanged; comments the agent had already finished show as "To
check" once.

## 0.1.0

First release: capture screens and branches, review them in a local page with
Comment and Navigate modes, `watch` for agents, `done` with evidence, image
attachments, versions per screen, and several projects in one place.
