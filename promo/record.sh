#!/usr/bin/env bash
# Records the promo's two acts from the live app (see promo/README.md):
#   promo/record.sh zh|detail
# Each act runs build/Kotone.app on a library of its own (promo/out/home, started from your
# library's 夜に駆ける on the first act) with promo/tour/<act>.js driving it, while promo/record
# captures the window and Spotify's sound into promo/out/<act>/.
set -euo pipefail
cd "$(dirname "$0")/.."
ACT=${1:?zh or detail}
OUT=promo/out
LIB="$HOME/Library/Application Support/Kotone"
mkdir -p "$OUT/bin"

for tool in record card; do
  if [ ! -x "$OUT/bin/$tool" ] || [ "promo/$tool.swift" -nt "$OUT/bin/$tool" ]; then
    swiftc -O "promo/$tool.swift" -o "$OUT/bin/$tool"
  fi
done

HOME_DIR="$PWD/$OUT/home"
if [ "$ACT" = zh ]; then
  rm -rf "$HOME_DIR"
  mkdir -p "$HOME_DIR/songs"
  cp -R "$LIB/songs/yoru-ni-kakeru" "$HOME_DIR/songs/"
  rm -f "$HOME_DIR"/songs/*/song.json.bak
  printf '{"spotify":{"yoru-ni-kakeru":"spotify:track:3dPtXHP0oXQ4HCWHsOA9js"}}' > "$HOME_DIR/state.json"
fi

cat promo/tour/lib.js "promo/tour/$ACT.js" > "$OUT/tour-$ACT.js"
rm -rf "${OUT:?}/$ACT" && mkdir -p "$OUT/$ACT"

# the everyday Kotone would also follow Spotify and share the page's settings: quit it meanwhile
if pgrep -x Kotone >/dev/null; then
  osascript -e 'tell application id "dev.kotone.app" to quit' 2>/dev/null || pkill -x Kotone || true
  for _ in $(seq 1 50); do pgrep -x Kotone >/dev/null || break; sleep 0.1; done
fi

KOTONE_HOME="$HOME_DIR" build/Kotone.app/Contents/MacOS/Kotone --tour "$OUT/tour-$ACT.js" --size 1280x800 --appearance dark \
  > "$OUT/$ACT/marks.log" 2> "$OUT/$ACT/app.err" &
APP=$!
caffeinate -d -i -w "$APP" &
"$OUT/bin/record" "$APP" com.spotify.client "$OUT/$ACT" > "$OUT/$ACT/record.log" &
REC=$!
wait "$APP" || true
kill -INT "$REC"
wait "$REC" || true
cat "$OUT/$ACT/marks.log" "$OUT/$ACT/record.log"
grep -q "^LOG ERROR" "$OUT/$ACT/marks.log" && exit 1 || true
