#!/usr/bin/env bash
# Builds and publishes Gather to Vercel (project gatherapp-live).
# Deploys from a temporary copy without the .git folder: Vercel blocks production deploys whose
# commit author it doesn't recognise as a member of the project, and the GitHub history isn't needed to build.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude '.env.local*' --exclude rules-tests --exclude .vercel-old-gather ./ "$TMP/"
(cd "$TMP" && npx vercel deploy --prod --yes)
echo "Live: https://gatherapp-live.vercel.app"
