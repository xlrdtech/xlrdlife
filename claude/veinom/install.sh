#!/usr/bin/env bash
# =============================================================
#  VEINOM · one-command installer (macOS / Linux)
#  Run:  curl -fsSL https://hitthe.link/claude/veinom/install.sh | bash
# =============================================================
set -e
VEINOM="$HOME/.veinom"
AVA="$VEINOM/ava"
EXT="$VEINOM/extension"

echo ""
echo "  VEINOM · Voice OS Avatar installer"
echo "  ----------------------------------------------"

# 1. Python
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then echo "  ! Python not found. Install python3 then re-run."; exit 1; fi
echo "  + python: $PY"

# 2. Ava voice engine
echo "  > installing Ava voice engine (edge-tts + aiohttp)..."
"$PY" -m pip install --quiet --upgrade edge-tts aiohttp >/dev/null 2>&1 || \
  "$PY" -m pip install --quiet --break-system-packages --upgrade edge-tts aiohttp >/dev/null 2>&1
echo "  + Ava voice engine ready"

# 3. Fetch components
mkdir -p "$AVA" "$EXT"
echo "  > downloading components..."
curl -fsSL "https://hitthe.link/claude/veinom/ava-server.py" -o "$AVA/ava-server.py"
curl -fsSL "https://hitthe.link/veinom/extension/veinom.zip" -o "$EXT/veinom.zip"
( cd "$EXT" && unzip -oq veinom.zip )
echo "  + components in $VEINOM"

# 4. Auto-start on login
UNAME="$(uname)"
if [ "$UNAME" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/org.xlrd.veinom.ava.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.xlrd.veinom.ava</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$AVA/ava-server.py</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" 2>/dev/null || true
  echo "  + Ava auto-start registered (launchd)"
else
  # Linux · systemd user service
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/veinom-ava.service" <<EOF
[Unit]
Description=VEINOM Ava voice server
[Service]
ExecStart=$PY $AVA/ava-server.py
Restart=always
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable --now veinom-ava.service 2>/dev/null || \
    ( "$PY" "$AVA/ava-server.py" >/dev/null 2>&1 & )
  echo "  + Ava auto-start registered (systemd user)"
fi

# 5. Start now + health check
"$PY" "$AVA/ava-server.py" >/dev/null 2>&1 &
sleep 2
if curl -fsS "http://localhost:7723/health" >/dev/null 2>&1; then
  echo "  + Ava server LIVE on http://localhost:7723"
fi

echo ""
echo "  DONE. Load the extension:"
echo "  ----------------------------------------------"
echo "  1. Open  chrome://extensions/  (or Orion on iOS)"
echo "  2. Developer mode -> Load unpacked"
echo "  3. Select:  $EXT"
echo ""
echo "  Or just open the web app:"
echo "       https://hitthe.link/claude/veinom/app/"
echo ""
