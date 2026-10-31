#!/usr/bin/env bash
# Disaster drill on a development computer (run-drill.ps1 starts it in a docker:cli container
# driving the local Docker; never on the agency's server: it erases the insurance-agency volumes).
# A fresh installation from a release, a key and backup disk A, a first backup, a client and a
# document entered after it, then everything erased and restored on « a new server »: the
# drill fails unless the client, the agent, the document and the same HTTPS authority are back.
# ROOT: the work folder as Docker sees it (also mounted at /drill); the release at /release.
set -euo pipefail
ROOT="$1"
export INSTALL_DIR="$ROOT/install"
DISK="$ROOT/disk"
step() { printf '\n######## %s\n' "$*"; }
psql_db() { docker compose -f "$INSTALL_DIR/compose.yml" --project-directory "$INSTALL_DIR" exec -T db psql -U agency_owner -d agency -tAc "$1"; }

step "1. Fresh installation"
# A blank laptop: what the previous drill left is removed (drill volumes only).
docker ps -aq --filter label=com.docker.compose.project=insurance-agency | xargs -r docker rm -f > /dev/null
docker volume rm insurance-agency-db insurance-agency-documents insurance-agency-proxy-data insurance-agency-proxy-config insurance-agency-wal-archive > /dev/null 2>&1 || true
rm -rf "$INSTALL_DIR" "$DISK"; mkdir -p "$INSTALL_DIR" "$DISK"
bash /release/install.sh
OWNER=$(openssl rand -hex 18); RUNTIME=$(openssl rand -hex 18); TOTP=$(openssl rand -base64 32)
cat > "$INSTALL_DIR/.env" <<EOF
APP_VERSION=
APP_HOST=agence.internal
LAN_IP=127.0.0.1
HTTPS_PORT=18443
HTTP_PORT=18080
PUBLIC_HTTPS_SUFFIX=:18443
POSTGRES_USER=agency_owner
POSTGRES_PASSWORD=$OWNER
POSTGRES_DB=agency
BACKUP_DISK=$DISK
EOF
echo "MIGRATION_DATABASE_URL=postgresql://agency_owner:$OWNER@db:5432/agency" > "$INSTALL_DIR/.env.admin"
cat > "$INSTALL_DIR/.env.api" <<EOF
DATABASE_URL=postgresql://app_runtime:$RUNTIME@db:5432/agency
APP_ORIGIN=https://agence.internal:18443
APP_TIMEZONE=Africa/Casablanca
TOTP_ENCRYPTION_KEY=$TOTP
AGENCY_NAME=Agence Essai Assurances et Conseils
AGENCY_LOGO_FILE=/data/agency/logo.png
EOF
cp /drill/logo.png "$INSTALL_DIR/agency/logo.png"
bash /release/install.sh
cd "$INSTALL_DIR"
docker compose run --rm -T -e SEED_PASSWORD="$(cat /drill/password.txt)" -v "$ROOT/seed-agent.mjs:/app/backend/seed-agent.mjs:ro" tools node seed-agent.mjs

step "2. Key, disk A, first backup"
./backup.sh init-key | tee /drill/keygen.txt
grep '^AGE-SECRET-KEY-' /drill/keygen.txt > /drill/identity.txt
BACKUP_ANY_DIR=1 ./backup.sh prepare-disk A
./backup.sh run
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt /drill/root-before.crt

step "3. Work after the full copy: a client and a document"
psql_db "INSERT INTO customer (id, ref, type, \"firstName\", \"lastName\", \"searchText\", \"createdById\", \"updatedAt\")
         SELECT gen_random_uuid(), 'CLI-777777', 'INDIVIDUAL', 'Après', 'Sauvegarde', 'apres sauvegarde', id, now()
         FROM app_user WHERE username = 'agent.essai'"
docker run --rm -v insurance-agency-documents:/d alpine:3.22 sh -c 'mkdir -p /d/2026/10 && echo "scan synthétique" > /d/2026/10/apres-sauvegarde && chown -R 1000:1000 /d'
psql_db "SELECT pg_switch_wal()" > /dev/null
sleep 5
./backup.sh run
./backup.sh status
find "$DISK" -type f | sort | sed "s|$DISK|disk|"

step "4. Disaster: database, documents, settings and HTTPS authority all gone"
docker compose down
docker volume rm insurance-agency-db insurance-agency-documents insurance-agency-proxy-data insurance-agency-proxy-config insurance-agency-wal-archive
rm -rf "$INSTALL_DIR"; mkdir -p "$INSTALL_DIR"
# A new server has none of the images either: they come back from the release only.
version="$(head -n 1 /release/VERSION)"
docker rmi "insurance-agency-api:$version" "insurance-agency-proxy:$version" "insurance-agency-db:$version" > /dev/null

step "5. New server: install, then restore with the private key"
bash /release/install.sh
sed -i "s|^BACKUP_DISK=.*|BACKUP_DISK=$DISK|" "$INSTALL_DIR/.env"
cd "$INSTALL_DIR"
echo RESTAURER | ./backup.sh restore --identity /drill/identity.txt --with-settings

step "6. Checks"
check() { if "$@"; then :; else echo "ÉCHEC"; exit 1; fi; }
psql_db "SELECT ref, \"firstName\" || ' ' || \"lastName\" FROM customer WHERE ref = 'CLI-777777'" > /drill/client.txt
check grep -q 'Après Sauvegarde' /drill/client.txt
echo "OK : le client saisi après la copie complète est revenu."
psql_db "SELECT username FROM app_user WHERE username = 'agent.essai'" > /drill/agent.txt
check grep -q agent.essai /drill/agent.txt
echo "OK : l'agent est revenu."
docker run --rm -v insurance-agency-documents:/d alpine:3.22 cat /d/2026/10/apres-sauvegarde > /drill/document.txt
check grep -q synth /drill/document.txt
echo "OK : le document est revenu."
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt /drill/root-after.crt
cmp /drill/root-before.crt /drill/root-after.crt && echo "Même autorité HTTPS qu'avant : les PC gardent leur cadenas."
docker compose ps
