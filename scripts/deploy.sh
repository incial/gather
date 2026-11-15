#!/usr/bin/env bash
# Publishes Gather to production: the Vercel project "gatherapp-ten" (https://gatherapp-ten.vercel.app).
# Only runs from a copy linked to that project (`npx vercel link --project gatherapp-ten`), so it can
# never publish to any other project. Deploys from a temporary copy without the .git folder: Vercel
# blocks production deploys whose commit author it doesn't recognise as a member of the project.
set -euo pipefail
cd "$(dirname "$0")/.."
linked="$(sed -n 's/.*"projectName":"\([^"]*\)".*/\1/p' .vercel/project.json 2>/dev/null || true)"
if [ "$linked" != "gatherapp-ten" ]; then
  echo "This copy isn't linked to the production Vercel project (gatherapp-ten)."
  echo "Push to main and ask the project's owner to deploy, or link it with: npx vercel link --project gatherapp-ten"
  exit 1
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude '.env*' --exclude rules-tests ./ "$TMP/"
(cd "$TMP" && npx vercel deploy --prod --yes)
echo "Live: https://gatherapp-ten.vercel.app"
