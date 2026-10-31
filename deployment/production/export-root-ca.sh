#!/usr/bin/env bash
# Copies the public root certificate of the server's local authority, to install once on each
# office PC (docs/deployment.md, étape 7). Its private key never leaves the server.
#   sudo ./export-root-ca.sh
set -euo pipefail
cd "${INSTALL_DIR:-/opt/insurance-agency}"
OUT="$PWD/insurance-agency-autorite-racine.crt"
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$OUT"
chmod 0644 "$OUT"
echo "Certificat : $OUT"
echo "Empreinte à vérifier sur chaque PC (SHA-256) :"
openssl x509 -in "$OUT" -noout -fingerprint -sha256
