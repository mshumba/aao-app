#!/usr/bin/env bash
# Builds the web app and publishes it to Cloudflare Pages (project aao-web,
# served at aao-web.pages.dev and aaolearning.com).
#
#   scripts/deploy-web.sh <empty output folder>
#
# Needs: the public EXPO_PUBLIC_* settings in .env, and `npx wrangler login`
# done once on this Mac. Only EXPO_PUBLIC_* values are read, so no secret can
# end up in the bundle.
set -euo pipefail

out="${1:?usage: scripts/deploy-web.sh <empty output folder>}"
if [ -e "$out" ] && [ -n "$(ls -A "$out")" ]; then
  echo "Choose an empty or new folder: $out is not empty." >&2
  exit 1
fi
cd "$(dirname "$0")/.."

# Public settings only; the published site always uses the real accounts.
set -a
eval "$(grep -E '^EXPO_PUBLIC_[A-Z_]+=' .env)"
set +a
unset EXPO_PUBLIC_AUTH_MODE

NODE_ENV=production npx expo export -p web --output-dir "$out" --clear

# Expo puts fonts and icon fonts under assets/node_modules, and wrangler never
# uploads a folder named node_modules, so the site would get its own HTML back
# instead of every font. Move them and point the bundle at the new folder.
if [ -d "$out/assets/node_modules" ]; then
  mv "$out/assets/node_modules" "$out/assets/vendor"
  grep -rl "/assets/node_modules/" "$out" | while read -r file; do
    perl -pi -e 's#/assets/node_modules/#/assets/vendor/#g' "$file"
  done
fi

# Every route is the app: serve index.html for paths without a file.
printf '/* /index.html 200\n' > "$out/_redirects"

npx --yes wrangler@4 pages deploy "$out" --project-name aao-web --branch main --commit-dirty=true
