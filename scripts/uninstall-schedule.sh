#!/bin/bash
set -euo pipefail

LABEL="com.daily-news-aggregator.refresh"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed daily 7:00 AM SGT refresh schedule."
