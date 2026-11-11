#!/usr/bin/env bash
# Builds and publishes Gather to Vercel (project gatherapp-live).
set -euo pipefail
cd "$(dirname "$0")/.."
npx vercel deploy --prod --yes
echo "Live: https://gatherapp-live.vercel.app"
