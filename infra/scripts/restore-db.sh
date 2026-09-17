#!/usr/bin/env bash
# Restores a pg_dump custom-format backup (see backup-db.sh) into a
# target database. Deliberately requires typing the target database
# name back as confirmation — a restore overwrites data, and the single
# most dangerous DR mistake is restoring into the wrong database because
# a terminal had the wrong DATABASE_URL exported.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname \
#     ./infra/scripts/restore-db.sh path/to/mohammad-travels-<timestamp>.dump
#
# See docs/OPERATIONS.md's "Restore drill" checklist — this script is
# the mechanical step in the middle of a much larger checklist
# (verifying application downtime/maintenance mode, confirming which
# backup to restore, validating the restore, and only then resuming
# traffic) that a script cannot safely automate end-to-end.
set -euo pipefail

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: pass the path to a .dump file produced by backup-db.sh." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL must be set to the TARGET database to restore into." >&2
  exit 1
fi

TARGET_DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

echo "About to restore '$DUMP_FILE' into database '$TARGET_DB_NAME'."
echo "THIS WILL OVERWRITE EXISTING DATA IN THAT DATABASE."
read -r -p "Type the database name ('$TARGET_DB_NAME') to confirm: " CONFIRMATION
if [[ "$CONFIRMATION" != "$TARGET_DB_NAME" ]]; then
  echo "Confirmation did not match — aborting, nothing was restored." >&2
  exit 1
fi

echo "Restoring..."
# --clean --if-exists: drop conflicting objects first so this is
# idempotent against a database that already has the schema (a restore
# drill run twice, or restoring over a partially-migrated database).
pg_restore "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges -v "$DUMP_FILE"

echo "Restore complete. Run 'npm run typecheck --workspace=apps/api' and a smoke test against GET /api/v1/health before resuming traffic."
