#!/usr/bin/env bash
# RAFTAR Automated PostGIS Restore & Drill Script
set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: ./restore-db.sh <path_to_backup_file.dump>"
  exit 1
fi

echo "[$(date -u)] Verifying SHA-256 checksum..."
if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "[$(date -u)] Restoring PostGIS schema and data from ${BACKUP_FILE}..."
docker exec -i raftar_postgres pg_restore \
  -U raftar_admin \
  -d raftar_db \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges < "${BACKUP_FILE}"

echo "[$(date -u)] Database restore drill completed successfully."
