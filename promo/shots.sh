#!/usr/bin/env bash
# The README's screenshots, docs/screenshots/*.png: the live app (build/Kotone.app) on the bundled
# demo excerpt, set up by promo/tour/shots.js, captured with its real window frame and set on a
# backdrop with room around it. The demo song shows its album art from your own library.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=promo/out
HOME_DIR="$PWD/$OUT/home-shots"
SHOTS="$OUT/shots"
RAW="$SHOTS/raw"
rm -rf "$SHOTS"
mkdir -p "$OUT/bin" "$RAW" docs/screenshots
[ -x "$OUT/bin/card" ] && [ "$OUT/bin/card" -nt promo/card.swift ] || swiftc -O promo/card.swift -o "$OUT/bin/card"

rm -rf "$HOME_DIR"
mkdir -p "$HOME_DIR/songs/yoru-ni-kakeru"
cover="$HOME/Library/Application Support/Kotone/songs/yoru-ni-kakeru/cover.jpg"
[ -f "$cover" ] || { echo "✗ add 夜に駆ける in Kotone first, for its cover: $cover" >&2; exit 1; }
cp "$cover" "$HOME_DIR/songs/yoru-ni-kakeru/"
# linked to its track, so the player bar isn't caught looking it up
printf '{"spotify":{"yoru-ni-kakeru":"spotify:track:3dPtXHP0oXQ4HCWHsOA9js"}}' > "$HOME_DIR/state.json"
cat promo/tour/lib.js promo/tour/shots.js > "$OUT/tour-shots.js"

if pgrep -x Kotone >/dev/null; then
  osascript -e 'tell application id "dev.kotone.app" to quit' 2>/dev/null || pkill -x Kotone || true
  for _ in $(seq 1 50); do pgrep -x Kotone >/dev/null || break; sleep 0.1; done
fi

for appearance in light dark; do
  window=
  KOTONE_HOME="$HOME_DIR" build/Kotone.app/Contents/MacOS/Kotone --tour "$OUT/tour-shots.js" --size 1280x800 --appearance $appearance |
    while read -r kind a b _; do
      case $kind in
        WINDOW) window=$a ;;
        MARK) [[ $b == shot-* ]] && screencapture -x -o -l "$window" "$RAW/${b#shot-}.png" && echo "captured ${b#shot-}" ;;
        LOG) echo "$a $b" ;;
      esac
    done
done

# each on a backdrop: light shots on a light one, dark on dark
for png in "$RAW"/*.png; do
  name=$(basename "$png" .png)
  case $name in *dark*) bg="radial-gradient(900px 600px at 10% 0%, rgba(80,120,190,.30), transparent 70%), radial-gradient(800px 600px at 100% 100%, rgba(214,120,90,.12), transparent 70%), linear-gradient(160deg, #141b28, #0c1018)" ;;
    *) bg="radial-gradient(900px 600px at 10% 0%, rgba(120,150,200,.30), transparent 70%), radial-gradient(800px 600px at 100% 100%, rgba(214,120,90,.18), transparent 70%), linear-gradient(160deg, #f1efe8, #f8f4ec)" ;;
  esac
  cat > "$SHOTS/$name.html" <<HTML
<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: 1440px; height: 960px; overflow: hidden; }
body { background: $bg; display: grid; place-items: center; }
.win { position: relative; width: 1280px; filter: drop-shadow(0 24px 48px rgba(0,0,0,.28)) drop-shadow(0 2px 6px rgba(0,0,0,.18)); }
img { display: block; width: 100%; }
/* the traffic lights as an active window shows them (whether it had the focus is up to whoever's
   at the Mac, and the pointer resting there shows their glyphs): 14pt, 23pt apart */
i { position: absolute; top: 8.75px; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.18); }
</style><div class="win"><img src="raw/$name.png"><i style="left:8.75px;background:#ec6765"></i><i style="left:31.75px;background:#f2ca44"></i><i style="left:54.75px;background:#65c466"></i></div>
HTML
  "$OUT/bin/card" "$SHOTS/$name.html" "$SHOTS/$name-framed.png" 1440 960
  sips -Z 2160 "$SHOTS/$name-framed.png" --out "docs/screenshots/$name.png" >/dev/null
  echo "✓ docs/screenshots/$name.png"
done
