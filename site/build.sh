#!/usr/bin/env bash
# Builds kotone.typedgrammar.com into site/dist: the page, the app icon and the README's
# screenshots as JPEGs. `site/build.sh --deploy` then publishes it (a static-assets Cloudflare
# Worker on that custom domain; needs `wrangler login`).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp index.html dist/
sips -s format png -Z 256 ../macos/AppIcon.icns --out dist/icon.png >/dev/null
for shot in breakdown breakdown-dark grammar-outline; do
  sips -s format jpeg -s formatOptions 84 ../docs/screenshots/$shot.png --out dist/$shot.jpg >/dev/null
done
du -sh dist | cut -f1 | xargs echo "✓ site/dist"
if [ "${1:-}" = --deploy ]; then
  ${WRANGLER:-npx wrangler@4} deploy
fi
