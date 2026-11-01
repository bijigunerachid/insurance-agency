# Network plan

Phase 2 design, approved by the owner (PR #3). All addresses are examples; the real values go in the
server's env file and in this document once the office network is known.

## 1. Addresses (example)

| Device | Address | Notes |
|---|---|---|
| Subnet | `192.168.50.0/24` | Office LAN |
| Router / gateway | `192.168.50.1` | Internet box; **no port forwarding** to the server |
| Server | `192.168.50.10` | Static IP (or DHCP reservation on the router) |
| Admin PC | `192.168.50.20` | The only PC allowed to use SSH |
| Agent PCs | `192.168.50.21`–`.29` | DHCP reservations recommended so the allow list stays accurate |
| Hostname | Chosen for each agency at installation; `insurance.internal` in the examples | Under `.internal` (reserved for private networks). Set on the router's DNS, or in each PC's `hosts` file. A setting (`APP_HOST`, `APP_ORIGIN`), never in the code |

### Temporary test server (Dell, before the mini-PC)

Not a production server: it only proves the installation steps (docs/deployment.md §12).

| Item | Value |
|---|---|
| Server | Dell laptop, Ubuntu Server 26.04.1 LTS, hostname `agency-server`, interface `enp9s0` |
| Address | `192.168.11.126` on `192.168.11.0/24`, gateway `192.168.11.1` |
| Application address | `https://insurance.internal`, pointing to `192.168.11.126` (each test PC's `hosts` file: `192.168.11.126 insurance.internal`) |
| Admin PC | The only PC allowed to use SSH once `firewall.sh` runs (`ADMIN_IP`): choose it **before**, or SSH from another PC stops working |
| Already set | ufw enabled; SSH by public key only, passwords refused; Docker Engine 29.9.2, Compose 5.6.1; timezone `Africa/Casablanca` |

## 2. Ports

| Port | Service | Who may connect | Published by |
|---|---|---|---|
| 443/tcp | Application (HTTPS) | Office subnet (or the list of agent PC addresses) | Docker, bound to `192.168.50.10` only |
| 80/tcp | Redirect to HTTPS | Office subnet | Docker, bound to `192.168.50.10` only (optional) |
| 22/tcp | SSH administration | Admin PC only | Host (OpenSSH) |
| 5432/tcp | PostgreSQL | **Nobody outside Docker** | Not published |
| Docker API | Docker daemon | **Nobody remote** | Unix socket only, never TCP |

Everything else is closed.

## 3. Host firewall (ufw)

Ubuntu commands, run on the server (Phase 11 turns these into a script and tests them):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.50.20 to any port 22 proto tcp     # SSH from the admin PC only
sudo ufw enable
```

## 4. Docker and the firewall (important)

Ports published by Docker are handled by Docker's own iptables rules, **before** ufw. A ufw rule alone does **not**
protect a published container port. Two controls are used together:

1. Compose publishes only on the LAN address: `ports: ["192.168.50.10:443:443"]` (never `0.0.0.0`, never the database).
2. A rule in the `DOCKER-USER` chain drops traffic to containers from outside the office subnet, kept across reboots
   in `/etc/ufw/after.rules` by `deployment/production/firewall.sh`: answers and container-to-container traffic
   pass, the office subnet reaches the proxy's container ports 8443 and 8080 (published as 443 and 80), everything
   else is dropped. The proxy runs unprivileged, so inside its container it listens on 8443/8080.

Test from a second machine (Phase 11): 443 reachable from an agent PC; 5432, 22 and the Docker API **not** reachable
from an agent PC; nothing reachable from outside the subnet.

## 5. HTTPS on the LAN

- Caddy's internal certificate authority issues the server certificate for `insurance.internal` only: one
  address, so opening the app by its IP number is refused (the API's Origin check needs one origin).
- The CA's **root certificate** (public part only) is exported once and installed on each agent PC in
  "Autorités de certification racines de confiance" (Windows). Browsers then show a normal padlock.
- The CA private key stays in the `proxy` data volume on the server and is included in the encrypted backup.
- HSTS is enabled once the root certificate is installed on every PC.

## 6. Physical and switch security

- Server in a locked cabinet or room; UPS next to it.
- Unused wall sockets disconnected at the switch.
- Office Wi-Fi (if any) on a **separate** network from the wired LAN, or guest isolation enabled; visitors never on the office LAN.
- Router admin password changed from default; UPnP and remote administration disabled; firmware kept up to date.
- An unmanaged switch cannot enforce port security; a small managed switch (with port isolation or a separate VLAN for
  guests) is recommended but not required for the pilot.

## 7. Internet use

| Need | Internet required? |
|---|---|
| Daily work (all app features) | No |
| Ubuntu security updates | Yes, when the admin runs them |
| Application updates | No: images are transferred offline (Phase 11) |
| Insurer portals in a normal browser | Yes, independent from this app |
