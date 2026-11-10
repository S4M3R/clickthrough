#!/usr/bin/env bash
# The agent's side of the demo, scripted so the recording can be repeated.
#
#   agent.sh <comment-id>
#
# A real coding agent is woken by `clickthrough watch`, edits the code, drives
# the app with its browser tool and re-captures the screen. Here the "code
# change" is a ready-made variant of the synthetic signup page (app.mjs), and
# the PR link and test count are sample values for a product that does not
# exist. The two clickthrough commands are the real ones, run as printed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
COMMENT="${1:?usage: agent.sh <comment-id>}"
PAUSE="${DEMO_PAUSE:-1.2}"

export CLICKTHROUGH_HOME="$HERE/.work/home"
unset CLICKTHROUGH_DIR
clickthrough() { node "$HERE/../../bin/cli.mjs" "$@"; }

mkdir -p "$HERE/.work/captures"
cd "$HERE/.work/acme-web"
cp_dir="../captures"

echo "# Comment $COMMENT asks for GitHub first. Edit the signup page, then capture it again."
sleep "$PAUSE"
node "$HERE/capture.mjs" onboarding signup github-first "$cp_dir/signup-v2"

echo '$ clickthrough screen onboarding signup --image signup-v2.png --boxes signup-v2.json --note "GitHub button first"'
clickthrough screen onboarding signup --image "$cp_dir/signup-v2.png" --boxes "$cp_dir/signup-v2.json" \
  --note "GitHub button first" > /dev/null
sleep "$PAUSE"

echo "\$ clickthrough done onboarding $COMMENT \"Swapped the buttons: GitHub is first.\" --version signup --image signup-v2.png \\"
echo '    --link https://example.com/acme/web/pull/12 --label "PR #12" --check "npm test: 49 passed"'
clickthrough done onboarding "$COMMENT" "Swapped the buttons: GitHub is first." \
  --version signup --image "$cp_dir/signup-v2.png" \
  --link https://example.com/acme/web/pull/12 --label "PR #12" \
  --check "npm test: 49 passed" > /dev/null
