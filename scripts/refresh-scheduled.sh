#!/bin/bash
# Called hourly by LaunchAgent; runs refresh once during 7:xx AM Singapore time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="${HOME}/.asia-insurance-daily-last-refresh"
TODAY=$(TZ=Asia/Singapore date +%Y-%m-%d)
HOUR=$(TZ=Asia/Singapore date +%H)

# Any minute during the 7 AM hour (SGT) — hourly launchd may not land at :00–:09
if [ "$HOUR" != "07" ]; then
  exit 0
fi

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$TODAY" ]; then
  exit 0
fi

echo "$TODAY" > "$STAMP"
exec "$ROOT/scripts/refresh.sh"
