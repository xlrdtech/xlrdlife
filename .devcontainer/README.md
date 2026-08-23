# Exedus mesh — neutral Codespace jump host

A GitHub Codespace (GitHub's cloud, **not our machines**) that joins qi's Tailscale tailnet,
so from any device you SSH/browse into THIS neutral node, then reach the real limbs (M4, nitro)
at full authority. The Codespace is the **door**; the limbs are where Xen lives.

## One-time setup
1. Tailscale auth key: https://login.tailscale.com/admin/settings/keys (make it reusable + ephemeral).
2. GitHub → Settings → Codespaces → Secrets → add **`TS_AUTHKEY`** = that key.

## Use (any device)
- Browser: repo → Code → Codespaces → create/open → integrated terminal.
- CLI: `gh codespace ssh`
- Into a limb: `tailscale ssh qi@<m4>`  ·  `ssh qi@100.97.145.50`  ·  `ssh selfexec@100.80.76.79`
- Into Xen: from the M4, `exedus` / `xen` / `sshx`.

## Caveat
Codespaces auto-stop on idle — this is **on-demand** neutral access, not 24/7. The always-on Xen
tap-in is sshx on the M4. Use this when you want a neutral cloud node that reaches the WHOLE mesh
(incl nitro) from anywhere.
