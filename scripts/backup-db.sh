#!/usr/bin/env bash
#
# Postgres backup. Postgres is the only record that an order exists, what was
# owed, and which address it was owed to — losing it loses the business, not
# just a cache.
#
#   ./scripts/backup-db.sh                       # uses $DATABASE_URL
#   BACKUP_DIR=/var/backups ./scripts/backup-db.sh
#   RETENTION_DAYS=30 ./scripts/backup-db.sh
#
# Restore is in docs/backups.md. A backup nobody has restored is a guess, so
# run that drill before you rely on this.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/ecommerce-$stamp.dump"

# Custom format (-Fc): compressed, and restorable table-by-table with
# pg_restore, which matters when you need one table back rather than all of
# them. --no-owner so it restores into a differently-named role.
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$out"

# Prove the file is a readable dump rather than a truncated write. Cheap, and
# it's the difference between having a backup and believing you do.
pg_restore --list "$out" > /dev/null

size="$(du -h "$out" | cut -f1)"
echo "backup ok: $out ($size)"

deleted=0
while IFS= read -r -d '' old; do
  rm -f "$old"
  deleted=$((deleted + 1))
done < <(find "$BACKUP_DIR" -name 'ecommerce-*.dump' -type f -mtime "+$RETENTION_DAYS" -print0)
echo "pruned $deleted backup(s) older than $RETENTION_DAYS days"
