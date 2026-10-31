#!/usr/bin/env bash
# The agency's backups on the server (docs/backup-restore.md). Run with sudo from /opt/insurance-agency.
#   sudo ./backup.sh init-key              the key pair: prints the private key ONCE
#   sudo ./backup.sh prepare-disk A        mark the plugged disk as backup disk A (or B)
#   sudo ./backup.sh install-timer         run "backup.sh run" every 5 minutes
#   sudo ./backup.sh run                   one backup now (what the timer does)
#   sudo ./backup.sh status                what the plugged disk holds
#   sudo ./backup.sh restore --identity /media/cle/cle-sauvegarde.txt [--time "2026-11-02 10:30:00"] [--with-settings]
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/insurance-agency}"
cd "$INSTALL_DIR"

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nERREUR : %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "lancez-le avec sudo."
[ -f .env ] || fail "$INSTALL_DIR/.env introuvable : installez d'abord l'application (install.sh)."

setting() { sed -n "s/^$1=//p" .env | tail -n 1; }
DISK="$(setting BACKUP_DISK)"
DISK="${DISK:-/mnt/agency-backup}"
mkdir -p status/no-identity
chmod 0755 status

# One backup job at a time (the timer, an update and a restore never run together).
exec 9> /run/insurance-agency-backup.lock
flock -n 9 || fail "une sauvegarde ou une restauration est déjà en cours."

backup_job() { docker compose run --rm -T backup "$@"; }

case "${1:-}" in
  init-key)
    backup_job keygen
    ;;

  prepare-disk)
    name="${2:-}"
    [[ "$name" =~ ^[AB]$ ]] || fail "usage : sudo ./backup.sh prepare-disk A   (ou B)"
    # Never the server's own disk: the folder must be a mounted disk (docs/backup-restore.md).
    if [ "${BACKUP_ANY_DIR:-}" != 1 ] && ! mountpoint -q "$DISK"; then
      fail "$DISK n'est pas un disque branché et monté."
    fi
    backup_job prepare-disk "$name"
    ;;

  install-timer)
    cat > /etc/systemd/system/insurance-agency-backup.service <<UNIT
[Unit]
Description=Sauvegarde de l'application de l'agence
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/backup.sh run
UNIT
    cat > /etc/systemd/system/insurance-agency-backup.timer <<'UNIT'
[Unit]
Description=Sauvegarde de l'application de l'agence, toutes les 5 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now insurance-agency-backup.timer
    systemctl list-timers insurance-agency-backup.timer --no-pager
    ;;

  run)
    backup_job sync
    ;;

  status)
    backup_job status
    ;;

  restore)
    shift
    identity="" target="" with_settings=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --identity) identity="${2:-}"; shift 2 ;;
        --time) target="${2:-}"; shift 2 ;;
        --with-settings) with_settings=1; shift ;;
        *) fail "option inconnue : $1" ;;
      esac
    done
    [ -s "$identity" ] || fail "--identity : le fichier de la clé privée de sauvegarde."
    if [ -n "$target" ] && ! [[ "$target" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
      fail "--time : AAAA-MM-JJ HH:MM:SS (heure UTC)."
    fi
    version="$(head -n 1 VERSION)"
    echo "La base de données et les documents de ce serveur vont être REMPLACÉS par la sauvegarde"
    echo "du disque branché${target:+ (état du $target UTC)}. Tapez RESTAURER pour continuer :"
    read -r answer
    [ "$answer" = RESTAURER ] || fail "abandon, rien n'a changé."
    started="$(date +%s)"

    # The private key, readable by root only, removed at the end whatever happens.
    keydir="$(mktemp -d "$INSTALL_DIR/status/.identity-XXXXXX")"
    chmod 0700 "$keydir"
    install -m 0400 "$identity" "$keydir/key.txt"
    trap 'rm -rf "$keydir"' EXIT
    export BACKUP_IDENTITY_DIR="$keydir"

    if [ "$with_settings" = 1 ]; then
      say "Réglages et autorité HTTPS"
      # Not through compose: on a new server the settings are not filled in yet. The volume is
      # created with compose's labels, so compose later uses it as its own.
      docker volume inspect insurance-agency-proxy-data > /dev/null 2>&1         || docker volume create --label com.docker.compose.project=insurance-agency           --label com.docker.compose.volume=proxy-data insurance-agency-proxy-data > /dev/null
      docker run --rm --user 0:0 --cap-drop ALL \
        --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add DAC_READ_SEARCH --cap-add FOWNER \
        --volume "$INSTALL_DIR:/settings" --volume "$DISK:/backup" --volume "$keydir:/identity:ro" \
        --volume insurance-agency-proxy-data:/proxy-data \
        --entrypoint agency-backup "insurance-agency-db:$version" restore-settings
      # The version installed on this server, not the one saved with the settings.
      sed -i "s/^APP_VERSION=.*/APP_VERSION=$version/" .env
    fi

    say "Base de données"
    docker compose stop api proxy db
    backup_job restore-db "$target"
    docker compose up --detach --wait db
    owner="$(setting POSTGRES_USER)"
    database="$(setting POSTGRES_DB)"
    for _ in $(seq 1 120); do
      state="$(docker compose exec -T db psql -U "$owner" -d "$database" -tAc 'SELECT pg_is_in_recovery()' 2>/dev/null || true)"
      [ "$state" = f ] && break
      sleep 5
    done
    [ "$state" = f ] || fail "la base ne sort pas de la restauration : docker compose logs db."
    docker compose exec -T db rm -rf /var/lib/postgresql/18/docker/restore_wal

    say "Documents"
    backup_job restore-documents

    say "Démarrage"
    docker compose up --detach --wait
    docker compose ps
    # The restored database starts a new history: a fresh full copy right away, so the next
    # restore never depends on the copies taken before this one.
    say "Copie complète après la restauration"
    backup_job base || echo "La copie complète a échoué : lancez sudo ./backup.sh run (disque branché ?)."
    say "Restauration terminée en $(( ($(date +%s) - started) / 60 )) min $(( ($(date +%s) - started) % 60 )) s."
    ;;

  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac
