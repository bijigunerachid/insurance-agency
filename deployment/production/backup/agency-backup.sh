#!/bin/sh
# The agency's backups, inside the database image (run by backup.sh on the server, never by hand).
# Everything written to the backup disk is encrypted with "age" for the agency's public key: the
# server can lock, only the private key kept at the owner's home can unlock (owner, 30/10/2026).
#
#   agency-backup keygen              make the key pair (prints the private key once)
#   agency-backup prepare-disk A      mark a freshly formatted disk as backup disk A (or B)
#   agency-backup sync                every 5 minutes: database changes (WAL), new documents, and a
#                                 full copy when this disk has none from today
#   agency-backup base                a full copy now
#   agency-backup status              what the disk holds
#   agency-backup restore-settings    (restore) the settings files and the HTTPS authority
#   agency-backup restore-db [TIME]   (restore) the database, up to TIME (YYYY-MM-DD HH:MM:SS, UTC)
#   agency-backup restore-documents   (restore) the scans and documents
set -eu

DISK=/backup
MARK="$DISK/.agency-backup-disk"
RECIPIENT=/settings/backup-recipient.txt
IDENTITY=/identity/key.txt
STATUS_DIR=/settings/status
PGDATA_DIR=/var/lib/postgresql/18/docker
# Full copies kept on each disk (one a day): two weeks.
KEEP_BASES=14

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# "2026-10-30T19:00:00Z" in seconds (busybox date reads "2026-10-30 19:00:00").
epoch() { date -u -d "$(printf '%s' "${1%Z}" | tr T ' ')" +%s; }
say() { printf '%s\n' "$*"; }
fail() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

# The finished full copies, oldest first (folder names are dates written by this program).
bases() {
  for dir in "$DISK"/base/*; do
    [ -d "$dir" ] || continue
    case "$dir" in *.tmp) continue ;; esac
    basename "$dir"
  done
}

# The status read by the application's « État du système » page (no secret in it).
write_status() {
  state="$1"
  message="$2"
  mkdir -p "$STATUS_DIR"
  disk_name="$(sed -n 's/^name=//p' "$MARK" 2>/dev/null || true)"
  last_base="$(bases | tail -n 1)"
  last_wal="$(cat "$DISK/last-wal-at" 2>/dev/null || true)"
  free_kb="$(df -Pk "$DISK" 2>/dev/null | awk 'NR == 2 { print $4 }' || true)"
  tmp="$STATUS_DIR/.backup.json.tmp"
  printf '{"state":"%s","message":"%s","checkedAt":"%s","disk":"%s","lastBase":"%s","lastWalAt":"%s","diskFreeKb":"%s"}\n' \
    "$state" "$message" "$(now)" "$disk_name" "$last_base" "$last_wal" "${free_kb:-}" > "$tmp"
  mv "$tmp" "$STATUS_DIR/backup.json"
}

need_disk() {
  if [ ! -f "$MARK" ]; then
    write_status missing "Aucun disque de sauvegarde branché"
    fail "aucun disque de sauvegarde branché (ou disque non préparé : backup.sh prepare-disk)."
  fi
}

need_key() {
  [ -s "$RECIPIENT" ] || fail "pas de clé de sauvegarde : lancez d'abord backup.sh init-key."
}

# Encrypts stdin into $1, written under a temporary name first: a cut never leaves half a file.
encrypt_to() {
  age -R "$RECIPIENT" -o "$1.tmp"
  mv "$1.tmp" "$1"
}

keygen() {
  [ ! -s "$RECIPIENT" ] || fail "une clé existe déjà ($RECIPIENT). Ne la remplacez pas sans raison."
  umask 077
  age-keygen -o /tmp/key.txt 2>/dev/null
  age-keygen -y /tmp/key.txt > "$RECIPIENT"
  chmod 0644 "$RECIPIENT"
  say "=== CLÉ PRIVÉE DE SAUVEGARDE : à recopier MAINTENANT, elle ne sera plus jamais affichée ==="
  cat /tmp/key.txt
  say "=== Gardez-la hors du serveur (papier au coffre et clé USB chez le responsable). ==="
  say "Sans elle, aucune sauvegarde ne peut être relue."
  rm -f /tmp/key.txt
}

prepare_disk() {
  name="${1:-}"
  case "$name" in A | B) ;; *) fail "nom du disque : A ou B." ;; esac
  [ ! -f "$MARK" ] || fail "ce disque est déjà préparé ($(sed -n 's/^name=//p' "$MARK"))."
  mkdir -p "$DISK/base" "$DISK/wal" "$DISK/documents"
  printf 'name=%s\nprepared=%s\n' "$name" "$(now)" > "$MARK"
  say "Disque $name prêt."
  write_status ok "Disque $name préparé"
}

copy_wal() {
  copied=0
  for file in /wal-archive/*; do
    [ -f "$file" ] || continue
    name="$(basename "$file")"
    [ -f "$DISK/wal/$name.age" ] && continue
    encrypt_to "$DISK/wal/$name.age" < "$file"
    copied=$((copied + 1))
  done
  if [ "$copied" -gt 0 ]; then now > "$DISK/last-wal-at"; fi
  # On the server, changes older than 3 days already on this disk are no longer needed there.
  find /wal-archive -type f -mtime +3 | while read -r file; do
    if [ -f "$DISK/wal/$(basename "$file").age" ]; then rm -f "$file"; fi
  done
  say "Modifications de la base copiées : $copied fichier(s)."
}

copy_documents() {
  copied=0
  cd /documents
  # Documents are never changed once stored (a new version is a new file): copy the new ones.
  find . -type f | while read -r file; do
    target="$DISK/documents/${file#./}.age"
    [ -f "$target" ] && continue
    mkdir -p "$(dirname "$target")"
    encrypt_to "$target" < "$file"
  done
  copied="$(find . -type f | wc -l)"
  cd /
  say "Documents sur le disque : $copied."
}

base() {
  stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
  dir="$DISK/base/$stamp"
  mkdir -p "$dir.tmp"
  printf 'started=%s\n' "$(now)" > "$dir.tmp/info"
  # A consistent copy of the running database, with the changes needed to replay it.
  pg_basebackup -h db -D - -F tar -X fetch -z -c fast | encrypt_to "$dir.tmp/database.tar.gz.age"
  # Not the version number: a restore keeps the version installed on the (new) server.
  tar -czf - -C /settings .env .env.api .env.admin agency backup-recipient.txt \
    | encrypt_to "$dir.tmp/settings.tar.gz.age"
  tar -czf - -C /proxy-data . | encrypt_to "$dir.tmp/proxy.tar.gz.age"
  printf 'finished=%s\n' "$(now)" >> "$dir.tmp/info"
  mv "$dir.tmp" "$dir"
  say "Copie complète : $stamp."
  prune
}

# Keeps the newest full copies, and the database changes from the oldest one kept onwards.
prune() {
  for dir in "$DISK"/base/*.tmp; do
    if [ -d "$dir" ]; then rm -rf "$dir"; fi
  done
  count="$(bases | wc -l)"
  if [ "$count" -gt "$KEEP_BASES" ]; then
    bases | head -n $((count - KEEP_BASES)) | while read -r old; do
      rm -rf "${DISK:?}/base/$old"
    done
  fi
  oldest="$(bases | head -n 1)"
  [ -n "$oldest" ] || return 0
  # WAL written more than a day before the oldest copy kept can no longer be replayed onto it.
  find "$DISK/wal" -type f ! -newer "$DISK/base/$oldest/info" -mtime +1 -exec rm -f {} +
}

sync_all() {
  need_disk
  need_key
  copy_wal
  copy_documents
  today="$(date -u +%Y-%m-%d)"
  if ! bases | grep -q "^$today"; then base; fi
  write_status ok "Sauvegarde à jour"
}

status() {
  need_disk
  say "Disque : $(sed -n 's/^name=//p' "$MARK")"
  say "Copies complètes :"
  bases | sed 's/^/  /'
  say "Dernière copie des modifications : $(cat "$DISK/last-wal-at" 2>/dev/null || echo aucune)"
  df -h "$DISK" | awk 'NR == 2 { print "Place libre : " $4 }'
  write_status ok "Sauvegarde à jour"
}

# The newest full copy finished before TIME (or the newest of all).
pick_base() {
  target="${1:-}"
  chosen=""
  for dir in $(bases); do
    finished="$(sed -n 's/^finished=//p' "$DISK/base/$dir/info")"
    if [ -z "$target" ] || [ "$(epoch "$finished")" -le "$(epoch "$target")" ]; then
      chosen="$dir"
    fi
  done
  [ -n "$chosen" ] || fail "aucune copie complète avant $target."
  echo "$chosen"
}

restore_settings() {
  need_disk
  [ -s "$IDENTITY" ] || fail "clé privée introuvable."
  dir="$(pick_base "")"
  age -d -i "$IDENTITY" "$DISK/base/$dir/settings.tar.gz.age" | tar -xzf - -C /settings
  chmod 0600 /settings/.env /settings/.env.api /settings/.env.admin
  age -d -i "$IDENTITY" "$DISK/base/$dir/proxy.tar.gz.age" | tar -xzf - -C /proxy-data
  chown -R 1000:1000 /proxy-data
  say "Réglages et autorité HTTPS restaurés (copie $dir)."
}

restore_db() {
  need_disk
  [ -s "$IDENTITY" ] || fail "clé privée introuvable."
  target="${1:-}"
  dir="$(pick_base "$target")"
  started="$(sed -n 's/^started=//p' "$DISK/base/$dir/info")"
  say "Copie complète choisie : $dir."
  mkdir -p "$PGDATA_DIR"
  find "$PGDATA_DIR" -mindepth 1 -delete
  age -d -i "$IDENTITY" "$DISK/base/$dir/database.tar.gz.age" | tar -xzf - -C "$PGDATA_DIR"
  # The changes made after the copy: from the disk, then from this server if it still has newer.
  mkdir -p "$PGDATA_DIR/restore_wal"
  touch -d "@$(epoch "$started")" /tmp/base-started
  find "$DISK/wal" -type f -name '*.age' -newer /tmp/base-started | while read -r file; do
    name="$(basename "$file" .age)"
    age -d -i "$IDENTITY" -o "$PGDATA_DIR/restore_wal/$name" "$file"
  done
  for file in /wal-archive/*; do
    [ -f "$file" ] || continue
    [ -f "$PGDATA_DIR/restore_wal/$(basename "$file")" ] || cp "$file" "$PGDATA_DIR/restore_wal/"
  done
  {
    echo "restore_command = 'cp $PGDATA_DIR/restore_wal/%f %p'"
    echo "recovery_target_action = 'promote'"
    if [ -n "$target" ]; then echo "recovery_target_time = '$target UTC'"; fi
  } >> "$PGDATA_DIR/postgresql.auto.conf"
  touch "$PGDATA_DIR/recovery.signal"
  chown -R postgres:postgres "$PGDATA_DIR"
  chmod 0700 "$PGDATA_DIR"
  say "Base prête à rejouer $(find "$PGDATA_DIR/restore_wal" -type f | wc -l) fichier(s) de modifications."
}

restore_documents() {
  need_disk
  [ -s "$IDENTITY" ] || fail "clé privée introuvable."
  restored=0
  cd "$DISK/documents"
  find . -type f -name '*.age' | while read -r file; do
    target="/documents/${file#./}"
    target="${target%.age}"
    [ -f "$target" ] && continue
    mkdir -p "$(dirname "$target")"
    age -d -i "$IDENTITY" -o "$target" "$file"
  done
  chown -R 1000:1000 /documents
  restored="$(find /documents -type f | wc -l)"
  say "Documents en place : $restored."
}

command="${1:-}"
[ $# -gt 0 ] && shift
case "$command" in
  keygen) keygen ;;
  prepare-disk) prepare_disk "${1:-}" ;;
  sync) sync_all ;;
  base) need_disk; need_key; base; write_status ok "Sauvegarde à jour" ;;
  status) status ;;
  restore-settings) restore_settings ;;
  restore-db) restore_db "${1:-}" ;;
  restore-documents) restore_documents ;;
  *) fail "commande inconnue : $command" ;;
esac
