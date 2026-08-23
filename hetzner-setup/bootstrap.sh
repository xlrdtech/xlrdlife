#!/usr/bin/env bash
# Xen Hetzner Bootstrap — post-installimage setup
# Run as root immediately after first boot into Ubuntu 24.04
# Usage: curl -fsSL https://hitthe.link/hetzner-setup/bootstrap.sh | bash
#        OR: scp bootstrap.sh root@142.132.204.105:/ && ssh root@142.132.204.105 bash /bootstrap.sh

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
banner() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()     { echo -e "${GREEN}✓ $1${NC}"; }
warn()   { echo -e "${YELLOW}⚠ $1${NC}"; }

banner "Xen Hetzner Bootstrap starting"
echo -e "Host: $(hostname) | $(date)"

# ── 1. System update ─────────────────────────────────────────────────────────
banner "System update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ufw fail2ban htop tmux \
  unattended-upgrades apt-transport-https ca-certificates gnupg lsb-release
ok "Base packages installed"

# ── 2. SSH hardening ─────────────────────────────────────────────────────────
banner "SSH hardening"
SSHD=/etc/ssh/sshd_config
cp "$SSHD" "${SSHD}.bak.$(date +%s)"

sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD"
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "$SSHD"

# Add if not present
grep -q "^PasswordAuthentication" "$SSHD" || echo "PasswordAuthentication no" >> "$SSHD"
grep -q "^PermitRootLogin"        "$SSHD" || echo "PermitRootLogin prohibit-password" >> "$SSHD"
grep -q "^MaxAuthTries"           "$SSHD" || echo "MaxAuthTries 3" >> "$SSHD"

systemctl restart sshd
ok "SSH hardened — password auth disabled, root login key-only, max 3 tries"
warn "Ensure your SSH public key is in /root/.ssh/authorized_keys before closing this session!"

# ── 3. UFW firewall ──────────────────────────────────────────────────────────
banner "UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
# Elasticsearch and Kibana are internal-only (bound to 127.0.0.1) — no public UFW rule needed
ufw --force enable
ok "UFW enabled — 22/80/443 open, ES/Kibana internal only"

# ── 4. Fail2ban ──────────────────────────────────────────────────────────────
banner "Fail2ban"
systemctl enable fail2ban
systemctl start fail2ban
ok "Fail2ban active"

# ── 5. Unattended upgrades ───────────────────────────────────────────────────
banner "Unattended upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Auto security upgrades enabled"

# ── 6. Elasticsearch 8.x ─────────────────────────────────────────────────────
banner "Elasticsearch 8.x install"
curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | \
  gpg --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] \
https://artifacts.elastic.co/packages/8.x/apt stable main" \
  > /etc/apt/sources.list.d/elastic-8.x.list

apt-get update -qq
apt-get install -y -qq elasticsearch
ok "Elasticsearch installed"

# ── 7. Configure Elasticsearch ───────────────────────────────────────────────
banner "Configuring Elasticsearch"
ES_CONF=/etc/elasticsearch/elasticsearch.yml
cp "$ES_CONF" "${ES_CONF}.bak"

cat > "$ES_CONF" <<'EOF'
cluster.name: xen
node.name: xen-hetzner-1
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
network.host: 127.0.0.1
http.port: 9200
discovery.type: single-node
xpack.security.enabled: false
xpack.security.http.ssl.enabled: false
xpack.security.transport.ssl.enabled: false
EOF

# JVM heap — set to 50% of RAM, max 32GB
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
HEAP_MB=$(( TOTAL_RAM_MB / 2 ))
HEAP_MB=$(( HEAP_MB > 32768 ? 32768 : HEAP_MB ))
HEAP_GB=$(( HEAP_MB / 1024 ))
[[ $HEAP_GB -lt 1 ]] && HEAP_GB=1

ES_JVM=/etc/elasticsearch/jvm.options.d/heap.options
mkdir -p "$(dirname "$ES_JVM")"
cat > "$ES_JVM" <<EOF
-Xms${HEAP_GB}g
-Xmx${HEAP_GB}g
EOF

ok "Elasticsearch configured — cluster=xen, host=127.0.0.1:9200, heap=${HEAP_GB}g, security=off"

# ── 8. Enable + start Elasticsearch ─────────────────────────────────────────
banner "Starting Elasticsearch"
systemctl daemon-reload
systemctl enable elasticsearch
systemctl start elasticsearch
ok "Elasticsearch service enabled and started"

# ── 9. Cloudflare tunnel (cloudflared) ──────────────────────────────────────
banner "Cloudflare tunnel (cloudflared)"
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | \
  gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  > /etc/apt/sources.list.d/cloudflared.list

apt-get update -qq
apt-get install -y -qq cloudflared
ok "cloudflared installed — run 'cloudflared tunnel login' to authenticate"

# ── 10. Final status ─────────────────────────────────────────────────────────
banner "Final status"

echo -e "\n${BOLD}UFW status:${NC}"
ufw status numbered

echo -e "\n${BOLD}Elasticsearch health (waiting up to 60s):${NC}"
for i in $(seq 1 12); do
  if curl -sf http://127.0.0.1:9200/_cluster/health?pretty 2>/dev/null; then
    break
  fi
  echo "  waiting for ES... (${i}/12)"
  sleep 5
done

echo -e "\n${BOLD}Services:${NC}"
for svc in elasticsearch fail2ban ufw; do
  status=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
  if [[ "$status" == "active" ]]; then
    echo -e "  ${GREEN}✓ $svc${NC}"
  else
    echo -e "  ${RED}✗ $svc ($status)${NC}"
  fi
done

echo -e "\n${GREEN}${BOLD}Bootstrap complete!${NC}"
echo -e "  ES:          http://127.0.0.1:9200"
echo -e "  Tunnel:      cloudflared tunnel login && cloudflared tunnel create xen"
echo -e "  Next steps:  add SSH pubkey, set root password, configure CF tunnel"
