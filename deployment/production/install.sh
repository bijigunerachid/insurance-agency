#!/usr/bin/env bash
# Installs or updates the application on the agency's server, from a release folder copied from
# the USB key (no Internet needed). Run it from that folder:
#   sudo ./install.sh
# The first time it prepares the settings files and stops: fill them in, then run it again.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/insurance-agency}"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RELEASE_DIR"

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nERREUR : %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "lancez-le avec sudo : sudo ./install.sh"
command -v docker >/dev/null || fail "Docker n'est pas installé (voir docs/deployment.md, étape 2)."

say "Vérification des fichiers de la version"
sha256sum --check --quiet SHA256SUMS || fail "fichier abîmé ou modifié : recopiez la version depuis la clé USB."
VERSION="$(head -n 1 VERSION)"
[[ "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z.-]{0,40}$ ]] || fail "numéro de version invalide."

say "Copie des fichiers dans $INSTALL_DIR"
# The agency folder holds only the public logo and icon: readable by the API's own user.
install -d -m 0750 "$INSTALL_DIR"
install -d -m 0755 "$INSTALL_DIR/agency" "$INSTALL_DIR/status"
for file in compose.yml .env.example .env.api.example .env.admin.example firewall.sh export-root-ca.sh backup.sh VERSION; do
  install -m 0640 "$file" "$INSTALL_DIR/$file"
done
chmod 0750 "$INSTALL_DIR/firewall.sh" "$INSTALL_DIR/export-root-ca.sh" "$INSTALL_DIR/backup.sh"
cd "$INSTALL_DIR"

# Always first: a new server restoring a backup needs the images before any setting exists.
say "Chargement des images de la version $VERSION"
docker load --input "$RELEASE_DIR/images.tar"

# First installation: the settings files, readable by root only, to be filled in.
if [ ! -f .env ] || [ ! -f .env.api ] || [ ! -f .env.admin ]; then
  for name in .env .env.api .env.admin; do
    [ -f "$name" ] || install -m 0600 "$name.example" "$name"
  done
  say "Première installation : remplissez $INSTALL_DIR/.env, .env.api et .env.admin"
  echo "(ou, pour remettre une sauvegarde sur un nouveau serveur : docs/backup-restore.md, étape 5)"
  echo "(mots de passe, adresse, clé, coordonnées de l'agence : voir docs/deployment.md, étape 5),"
  echo "mettez le logo et l'icône dans $INSTALL_DIR/agency, puis relancez : sudo ./install.sh"
  exit 0
fi
chmod 0600 .env .env.api .env.admin
find agency -type f -exec chmod 0644 {} +

# Settings still holding an example value would start a server nobody can use safely.
grep -q '^POSTGRES_PASSWORD=..*' .env || fail "POSTGRES_PASSWORD est vide dans .env."
grep -q '^TOTP_ENCRYPTION_KEY=..*' .env.api || fail "TOTP_ENCRYPTION_KEY est vide dans .env.api."
if grep -qE 'OWNER_PASSWORD|RUNTIME_PASSWORD' .env.api .env.admin; then
  fail "remplacez OWNER_PASSWORD / RUNTIME_PASSWORD dans .env.api et .env.admin."
fi


# A copy of the data before anything changes, with the version still running. Skipped only on
# a first installation (no key yet) or when asked: SKIP_BACKUP=1 sudo ./install.sh
if [ -s backup-recipient.txt ] && [ "${SKIP_BACKUP:-}" != 1 ]; then
  say "Sauvegarde avant la mise à jour"
  "$INSTALL_DIR/backup.sh" run     || fail "la sauvegarde a échoué (disque branché ?) : rien n'a été changé. Voir docs/backup-restore.md."
fi

# The version running before this update, kept across a failed attempt (which already wrote the
# new number in .env), so the message and the rollback name the right one.
CURRENT="$(sed -n 's/^APP_VERSION=//p' .env)"
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$VERSION" ]; then
  echo "$CURRENT" > .previous-version
fi
PREVIOUS="$(cat .previous-version 2>/dev/null || true)"
if grep -q '^APP_VERSION=' .env; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" .env
else
  echo "APP_VERSION=$VERSION" >> .env
fi
trap 'echo; echo "La mise à jour a échoué. Version précédente : ${PREVIOUS:-aucune}."; echo "Voir docs/deployment.md, « Si une mise à jour échoue »."' ERR

say "Base de données"
docker compose up --detach --wait db
docker compose run --rm tools node scripts/db-roles.js
docker compose run --rm --env CHECKPOINT_DISABLE=1 tools node ../node_modules/prisma/build/index.js migrate deploy

say "Démarrage de l'application"
docker compose up --detach --wait --remove-orphans
docker compose ps
trap - ERR
say "Version $VERSION installée (avant : ${PREVIOUS:-première installation})."
