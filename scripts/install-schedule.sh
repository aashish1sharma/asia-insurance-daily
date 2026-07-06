#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.daily-news-aggregator.refresh"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
WRAPPER="$HOME/.local/bin/asia-insurance-daily-refresh"
REFRESH_SCRIPT="$ROOT/scripts/refresh-scheduled.sh"
NODE="$(command -v node)"

chmod +x "$ROOT/scripts/refresh.sh"
chmod +x "$REFRESH_SCRIPT"

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$ROOT/logs"

# LaunchAgent cannot execute scripts inside OneDrive (macOS TCC). Wrapper lives in ~/.local/bin.
cat > "$WRAPPER" <<EOF
#!/bin/bash
set -euo pipefail
export NODE="${NODE}"
export TZ=Asia/Singapore
exec /bin/bash "${REFRESH_SCRIPT}"
EOF
chmod +x "$WRAPPER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${WRAPPER}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE</key>
    <string>${NODE}</string>
    <key>TZ</key>
    <string>Asia/Singapore</string>
  </dict>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>${ROOT}/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/logs/launchd.err.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Scheduled hourly check for 7:xx AM SGT refresh (once per day)."
echo "Launch agent: $PLIST"
echo "Wrapper (outside OneDrive): $WRAPPER"
echo "Logs: $ROOT/logs/refresh.log"
echo ""
echo "If refresh still fails, grant Full Disk Access to /bin/bash in"
echo "System Settings → Privacy & Security → Full Disk Access,"
