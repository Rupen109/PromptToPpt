#!/bin/bash
# PNG → web JPEG (max 1920px, quality 82) for the generated template photography, removes the PNGs, then refreshes the picture manifest
# the deck composer uses (so a deck never points at a picture that failed to generate).
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/apps/web/public/template-assets" || exit 1
for f in *.png; do [ -e "$f" ] || continue; n="${f%.png}"; sips -Z 1920 -s format jpeg -s formatOptions 82 "$f" --out "$n.jpg" >/dev/null 2>&1 && rm "$f"; done
ls *.jpg | wc -l
node "$ROOT/scripts/template-photo-manifest.mjs"
