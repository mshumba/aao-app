#!/usr/bin/env bash
# Publishes the branded holding site (web/holding: home, privacy, terms) to the
# public addresses while the app is in private testing:
# aaolearning.com and aao-web.pages.dev (Cloudflare Pages, production), and
# aao-app.expo.app (EAS Hosting), so older links show it too.
#
#   scripts/deploy-holding.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes wrangler@4 pages deploy web/holding --project-name aao-web --branch main --commit-dirty=true
npx --yes eas-cli@latest deploy --prod --export-dir web/holding --non-interactive
