# Hacker News: Show HN

Submit at https://news.ycombinator.com/submit. Nothing here has been posted.

## Title (74 characters; the limit is 80)

    Show HN: Clickthrough – click any UI component, your coding agent fixes it

## URL

    https://github.com/S4M3R/clickthrough

The repository, not the landing page: its README opens with the demo and the
one-command try-out. The site goes in the comment.

## First comment (post it right after submitting)

I kept telling my coding agent things like "the second button on the signup page, no, the other one". So I built a local review page for it.

The agent captures every screen of a flow (signup, onboarding, checkout) with the position of each component, and wires the branches: "Sign up with Google" and "Email and password" are separate paths. I click through it like the real app, click the component that's wrong, and write what should change. `clickthrough watch` wakes the agent, it changes the code, captures the screen again, and I get a before/after with the checks it ran. Nothing is closed until I accept it.

It is a Node CLI with zero dependencies and a local web page. Flows are JSON and screenshots in your repo; nothing leaves your machine. It works with any agent that can run a shell command and drive a browser. MIT.

Try it: `npx clickthrough demo` opens an example flow with a change waiting for review. Site with a 40-second video: https://clickthrough.agustin.build

What I am least sure about: capturing depends on the agent driving a browser well, and that varies a lot between agents. I would like to hear where it breaks for you.

## On the day

- Be there for the first two to three hours and answer every comment with specifics.
- Do not ask anyone to upvote, and do not send people a direct link to the post to vote on.
- Before submitting: `npm view clickthrough version` prints the latest version, and
  `npx clickthrough demo` opens the example on a machine that never had it.
