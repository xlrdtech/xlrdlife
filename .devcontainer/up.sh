#!/usr/bin/env bash
# exedus-mesh Codespace = a NEUTRAL jump host (GitHub cloud, not ours) that joins qi's
# tailnet so it can ssh into the real limbs (M4, nitro) at full authority.
# qi sets a Codespace secret TS_AUTHKEY = a Tailscale auth key. We never touch the key.
set -e
if [ -z "${TS_AUTHKEY:-}" ]; then
  echo "[exedus] No TS_AUTHKEY secret set yet."
  echo "[exedus] GitHub > Settings > Codespaces > Secrets > add TS_AUTHKEY, then: sudo tailscale up --ssh"
  exit 0
fi
sudo tailscale up --authkey="$TS_AUTHKEY" --hostname=exedus-codespace --ssh --accept-routes || true
echo "[exedus] tailnet status:"; tailscale status 2>/dev/null | head -12
echo "[exedus] into a limb:  tailscale ssh qi@<m4>   |   ssh qi@100.97.145.50   |   ssh selfexec@100.80.76.79"
