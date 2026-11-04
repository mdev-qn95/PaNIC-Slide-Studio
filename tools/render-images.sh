#!/usr/bin/env bash
# Re-renders the social preview image and PNG icons with headless Chrome.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
ROOT="$(pwd -W 2>/dev/null || pwd)" # Windows-style path under Git Bash
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --virtual-time-budget=4000 --window-size="$2" --screenshot="$ROOT/$3" "file:///${ROOT// /%20}/$1"; }
shot tools/og-cover.html 1200,630 assets/img/og-cover.png
shot tools/icon.html 180,180 assets/img/apple-touch-icon.png
