#!/usr/bin/env bash
# Quit a running Kotone before opening the fresh build: `open` would only bring the old process
# (old Swift bridge) to the front, while its web view already loads the new assets from disk.
set -euo pipefail
cd "$(dirname "$0")/.."
if pgrep -x Kotone >/dev/null; then
  osascript -e 'tell application id "dev.kotone.app" to quit' 2>/dev/null || pkill -x Kotone || true
  for _ in $(seq 1 50); do pgrep -x Kotone >/dev/null || break; sleep 0.1; done
fi
open build/Kotone.app
