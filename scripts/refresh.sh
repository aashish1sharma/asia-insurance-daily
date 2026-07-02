#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/refresh.log"
NODE="${NODE:-$(command -v node)}"
export TZ=Asia/Singapore

mkdir -p "$LOG_DIR"

{
  echo "=== $(TZ=Asia/Singapore date '+%Y-%m-%d %H:%M:%S %Z') ==="
  cd "$ROOT"
  "$NODE" scripts/load-sources.mjs
  "$NODE" scripts/fetch-news.mjs
  echo
} >> "$LOG_FILE" 2>&1
