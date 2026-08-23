#!/usr/bin/env bash
# Exedus universal installer — curl -fsSL https://raw.githubusercontent.com/xlrdtech/hitthe.link/main/exedus.sh | bash
#
# ONE Xen, ONE session. The M4 Mac HOSTS the single voice-enabled Xen tmux session.
# Every other device is a CLIENT: `exedus` SSHes into the M4 and ATTACHES to that same
# session — identical screen everywhere, you talk to the one Xen. Voice lives on the M4.
#
# Roles (auto-detected; override with XEN_ROLE=hub|client):
#   hub    = the M4. `exedus` attaches LOCALLY to the live voice session (~/.xen_tmux_target).
#   client = VM / nitro / any other box. `exedus` = ssh M4 + attach. Auto-attaches on login.
#
# Installs GLOBALLY into /usr/local/bin (falls back to ~/.local/bin without sudo).
set -e
echo "==> Exedus installer"

OS="$(uname -s)"
SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# --- M4 hub coordinates (override via env at install time) ---
M4_HOST="${XEN_M4_HOST:-100.97.145.50}"   # M4 tailnet IP
M4_USER="${XEN_M4_USER:-qi}"

# --- role detection ---
ROLE="${XEN_ROLE:-}"
if [ -z "$ROLE" ]; then
  if [ "$OS" = "Darwin" ] && [ -x "/Users/qi/bin/xen-reply-vvs" ] && [ "$(id -un)" = "qi" ]; then
    ROLE="hub"
  else
    ROLE="client"
  fi
fi
echo "==> Role: $ROLE  (M4 hub = ${M4_USER}@${M4_HOST})"

# --- pick a global bin dir ---
BIN=/usr/local/bin
if ! { [ -w "$BIN" ] || [ -n "$SUDO" ]; }; then BIN="$HOME/.local/bin"; fi
mkdir -p "$BIN" "$HOME/.xen"
WT() { if [ "$BIN" = /usr/local/bin ] && [ -n "$SUDO" ]; then $SUDO tee "$1" >/dev/null; else tee "$1" >/dev/null; fi; }

if [ "$ROLE" = "hub" ]; then
  # ---- HUB: attach locally to the live voice session ----
  cat > "$HOME/.xen/xen-attach-local.sh" <<'EOF'
#!/usr/bin/env bash
# Attach the caller to the ONE live voice session (resolved from the voice-pane sentinel).
set -euo pipefail
TMUX_BIN="$(command -v tmux || echo /opt/homebrew/bin/tmux)"
SENT="$HOME/.xen_tmux_target"
PANE=""; [ -f "$SENT" ] && PANE="$(tr -d '[:space:]' < "$SENT")"
SESS=""
[ -n "$PANE" ] && SESS="$("$TMUX_BIN" display-message -p -t "$PANE" '#{session_name}' 2>/dev/null || true)"
[ -z "$SESS" ] && SESS="$("$TMUX_BIN" list-panes -a -F '#{session_name} #{pane_current_command}' 2>/dev/null | awk '$2 ~ /^[0-9]+\.[0-9]+/ {print $1; exit}')"
[ -z "$SESS" ] && SESS="$("$TMUX_BIN" list-sessions -F '#{session_name}' 2>/dev/null | head -1)"
[ -z "$SESS" ] && { echo "xen-attach: no tmux session on hub" >&2; exit 1; }
exec "$TMUX_BIN" attach-session -t "$SESS"
EOF
  chmod +x "$HOME/.xen/xen-attach-local.sh"
  printf '#!/usr/bin/env bash\nexec "%s/.xen/xen-attach-local.sh"\n' "$HOME" | WT "$BIN/xen"
else
  # ---- CLIENT: ssh into the M4 and attach to the one session ----
  cat > "$HOME/.xen/xen-client-launcher.sh" <<EOF
#!/usr/bin/env bash
M4_HOST="\${XEN_M4_HOST:-$M4_HOST}"; M4_USER="\${XEN_M4_USER:-$M4_USER}"
M4_KEY="\${XEN_M4_KEY:-\$HOME/.ssh/id_ed25519}"
KEYOPT=""; [ -f "\$M4_KEY" ] && KEYOPT="-i \$M4_KEY"
exec ssh -tt \$KEYOPT -o ConnectTimeout=10 -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \\
  -o StrictHostKeyChecking=accept-new "\${M4_USER}@\${M4_HOST}" 'bash -lc "\$HOME/.xen/xen-attach-local.sh"'
EOF
  chmod +x "$HOME/.xen/xen-client-launcher.sh"
  printf '#!/usr/bin/env bash\nexec "%s/.xen/xen-client-launcher.sh"\n' "$HOME" | WT "$BIN/xen"

  # login auto-attach (guarded so it never breaks scp / non-interactive ssh)
  RC="$HOME/.bashrc"; touch "$RC"
  if ! grep -q "XEN-AUTO-ATTACH" "$RC"; then
    cat >> "$RC" <<EOF

# XEN-AUTO-ATTACH — drop straight into the one Xen on interactive login.
if [[ \$- == *i* ]] && [ -t 1 ] && [ -z "\$TMUX" ] && [ -z "\$XEN_NO_AUTOATTACH" ]; then
  "$BIN/xen" || true
fi
EOF
  fi
  PF="$HOME/.bash_profile"; touch "$PF"
  grep -q 'source ~/.bashrc' "$PF" 2>/dev/null || echo '[ -f ~/.bashrc ] && source ~/.bashrc' >> "$PF"
fi

if [ "$BIN" = /usr/local/bin ] && [ -n "$SUDO" ]; then $SUDO chmod +x "$BIN/xen"; $SUDO ln -sf "$BIN/xen" "$BIN/exedus";
else chmod +x "$BIN/xen"; ln -sf "$BIN/xen" "$BIN/exedus"; fi

echo "==> Installed ($OS, role=$ROLE). Commands: exedus == xen  (in $BIN)"
if [ "$ROLE" = "client" ]; then
  echo "    Client attaches to the M4 hub at ${M4_USER}@${M4_HOST}."
  echo "    ONE-TIME: this device's SSH pubkey (~/.ssh/id_ed25519.pub) must be in the M4's ~/.ssh/authorized_keys."
  echo "    Then: type  exedus  (or just log in) -> you land in the one Xen, same screen as every device."
else
  echo "    Hub: type  exedus  -> attaches to the live voice session locally."
fi
