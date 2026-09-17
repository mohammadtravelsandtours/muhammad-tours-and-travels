#!/usr/bin/env bash
# Takes a timestamped pg_dump of the platform's Postgres database and
# prunes local copies past a retention window. Uses only `pg_dump`/
# `gzip`/`find` — standard Postgres client tools, not a new dependency —
# matching this repo's general "no new package unless it's a real
# integration, and even then no vendor SDK where a stable REST/CLI
# contract already exists" posture (see apps/api's Phase 9 adapters).
#
# This script is the MECHANISM, not the SCHEDULE — see
# docs/OPERATIONS.md's "Backups & disaster recovery" section for why
# scheduling it is an infra decision (a cron entry on whatever host runs
# this, or your managed Postgres provider's own automated-snapshot
# feature) that depends on real infrastructure this repo does not
# provision, and cannot honestly fake.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname \
#     ./infra/scripts/backup-db.sh [output-dir] [retention-days]
#
# Optional: set BACKUP_S3_BUCKET (and have the `aws` CLI configured) to
# also upload the dump — skipped entirely if unset, so this remains
# runnable with zero cloud credentials for a local/dev dry run.
set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
RETENTION_DAYS="${2:-14}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL must be set (see .env.example)." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$OUTPUT_DIR/mohammad-travels-${TIMESTAMP}.dump"

echo "Backing up $DATABASE_URL -> $DUMP_FILE"
# Custom format (-Fc): compressed, and restorable selectively with
# pg_restore (e.g. one table) rather than a monolithic SQL replay.
pg_dump "$DATABASE_URL" -Fc -f "$DUMP_FILE"

echo "Backup complete: $(du -h "$DUMP_FILE" | cut -f1)"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "WARNING: BACKUP_S3_BUCKET is set but the aws CLI is not installed — skipping upload." >&2
  else
    echo "Uploading to s3://${BACKUP_S3_BUCKET}/$(basename "$DUMP_FILE")"
    aws s3 cp "$DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/$(basename "$DUMP_FILE")"
  fi
fi

echo "Pruning local backups older than ${RETENTION_DAYS} days in $OUTPUT_DIR"
find "$OUTPUT_DIR" -name 'mohammad-travels-*.dump' -mtime +"$RETENTION_DAYS" -print -delete

echo "Done."
