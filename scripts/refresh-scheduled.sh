#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$ROOT/logs/.last-refresh-sgt-date"
TODAY=$(TZ=Asia/Singapore date +%Y-%m-%d)
HOUR=$(TZ=Asia/Singapore date +%H)
MINUTE=$(TZ=Asia/Singapore date +%M)

# Run once per day between 7:00–7:09 AM Singapore time
if [ "$HOUR" != "07" ] || [ "$MINUTE" -gt "09" ]; then
  exit 0
fi

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$TODAY" ]; then
  exit 0
fi

echo "$TODAY" > "$STAMP"
exec "$ROOT/scripts/refresh.sh"
