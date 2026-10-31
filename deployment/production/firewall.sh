#!/usr/bin/env bash
# The server's firewall (docs/network.md §3–4): nothing comes in except HTTPS from the office
# network and SSH from the admin PC. Docker's published ports are filtered in DOCKER-USER too,
# because Docker's own rules run before ufw. Safe to run again.
#   sudo ./firewall.sh 192.168.50.0/24 192.168.50.20
set -euo pipefail

OFFICE_SUBNET="${1:-}"
ADMIN_IP="${2:-}"
cidr='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'
ip='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
[ "$(id -u)" -eq 0 ] || { echo "Lancez-le avec sudo." >&2; exit 1; }
[[ "$OFFICE_SUBNET" =~ $cidr ]] && [[ "$ADMIN_IP" =~ $ip ]] || {
  echo "Usage : sudo ./firewall.sh <réseau du bureau, ex. 192.168.50.0/24> <adresse du PC admin>" >&2
  exit 1
}
command -v ufw >/dev/null || apt-get install -y ufw

# The host: deny everything coming in, SSH from the admin PC only.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_IP" to any port 22 proto tcp comment 'SSH, PC admin'

# Containers: only the office network reaches the published ports (443 and 80), whatever
# Docker opens. Containers talking to each other and answers to their requests pass.
RULES=/etc/ufw/after.rules
sed -i '/^# BEGIN insurance-agency/,/^# END insurance-agency/d' "$RULES"
cat >> "$RULES" <<RULES_EOF
# BEGIN insurance-agency
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -s 172.16.0.0/12 -j RETURN
-A DOCKER-USER -s $OFFICE_SUBNET -p tcp -m multiport --dports 8443,8080 -j RETURN
-A DOCKER-USER -j DROP
COMMIT
# END insurance-agency
RULES_EOF

ufw --force enable
systemctl restart docker
ufw status verbose
iptables -S DOCKER-USER
echo "Pare-feu en place. Vérifiez depuis un autre PC (docs/deployment.md, étape 4)."
