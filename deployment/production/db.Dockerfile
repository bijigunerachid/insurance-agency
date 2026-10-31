# The database image: PostgreSQL 18.6 with "age" for the encrypted backups, and the backup program
# (agency-backup) run by backup.sh. The same image serves the database and the backup jobs.
#   docker build -f deployment/production/db.Dockerfile -t insurance-agency-db:<version> .

# postgres:18.6-alpine3.24, pinned by digest (the one used in development)
FROM postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
RUN apk add --no-cache age=1.3.2-r1 \
  && install -d -o postgres -g postgres -m 0700 /wal-archive
COPY deployment/production/backup/agency-backup.sh /usr/local/bin/agency-backup
# The usual rules of the image, plus the full-copy connection of the backup job (with a password).
COPY deployment/production/backup/pg_hba.conf /etc/postgresql/pg_hba.conf
RUN chmod 0755 /usr/local/bin/agency-backup
