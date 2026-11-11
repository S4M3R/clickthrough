# Alt text for the launch media

**demo.mp4 / demo.gif**

Screen recording of Clickthrough. A list of projects opens a signup flow shown as a tree of branches. In Navigate mode the pointer clicks "Continue with GitHub", then "Authorize", "Continue" and "Stripe", moving through the screens. Back on the signup screen, in Comment mode, it clicks the GitHub button and writes "Put GitHub first. Most of our users are developers." In a terminal below, the agent receives the comment and runs two commands. The screen updates to version 2 with GitHub first, and the comment is marked "To check" with evidence: the new version, a screenshot, a link to PR 12 and "npm test: 49 passed". The Changes list shows the comment as "Working", then "To check" once the agent is done. The pointer opens it, sees the screen before and after side by side, clicks "Looks good", and opens the Checked list.

**og.png (link card)**

Clickthrough. Headline: "Click the button that's wrong. Your coding agent fixes it." Next to it, a comment on a signup screen's GitHub button, marked Done by the agent with a new version, a screenshot, a PR link and a passing check.

**tree.png**

The branch tree of a signup flow in Clickthrough. "Sign up with GitHub" leads to workspace and data-source screens and forks into Postgres, Stripe and API. "Sign up with Google" and "Email and password" are separate branches that continue at "Name your workspace". Blue badges count open comments.

**comment.png**

Comment mode in Clickthrough. Every component of a "Name your workspace" form is outlined. A comment box on the Workspace URL field reads "Keep the acme.example/ prefix fixed, like this sketch", with a small sketch attached.

**navigate.png**

Navigate mode in Clickthrough. On a "Connect your data" screen, the cards that lead somewhere have dashed outlines. The Stripe card is highlighted with a tooltip: "Go to Connect Stripe".

**evidence.png**

A comment thread on "Button: Continue with GitHub", marked "To check". The reviewer wrote "Put GitHub first. Most of our users are developers." The agent replied "Swapped the buttons: GitHub is first." with evidence: a button to view version 2 of the screen, a screenshot, a link to PR 12 and a check, "npm test: 49 passed". Under it, a "Looks good" button.
