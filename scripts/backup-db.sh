#!/usr/bin/env bash
# RAFTAR Automated PostGIS Database Backup & Encryption Script
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/raftar}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RAW_BACKUP="${BACKUP_DIR}/raftar_db_${TIMESTAMP}.dump"
ENCRYPTED_BACKUP="${BACKUP_DIR}/raftar_db_${TIMESTAMP}.dump.enc"
LOG_FILE="${BACKUP_DIR}/backup.log"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-/etc/raftar/secrets/backup.key}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] Starting PostGIS logical backup..." >> "${LOG_FILE}"

# 1. Execute pg_dump with custom compressed archive format
docker exec -t raftar_postgres pg_dump \
  -U raftar_admin \
  -d raftar_db \
  --format=custom \
  --blobs \
  --verbose > "${RAW_BACKUP}"

# 2. Encrypt at rest using OpenSSL AES-256-CBC with PBKDF2
if [[ -f "${ENCRYPTION_KEY}" ]]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "${RAW_BACKUP}" -out "${ENCRYPTED_BACKUP}" -pass "file:${ENCRYPTION_KEY}"
  rm -f "${RAW_BACKUP}"
  BACKUP_TARGET="${ENCRYPTED_BACKUP}"
else
  echo "[$(date -u)] WARNING: Backup encryption key missing. Storing plaintext with restricted permissions." >> "${LOG_FILE}"
  chmod 600 "${RAW_BACKUP}"
  BACKUP_TARGET="${RAW_BACKUP}"
fi

# 3. Generate SHA-256 integrity checksum
sha256sum "${BACKUP_TARGET}" > "${BACKUP_TARGET}.sha256"

# 4. Prune local backups older than 30 days
find "${BACKUP_DIR}" -type f -name "raftar_db_*" -mtime +30 -delete

echo "[$(date -u)] PostGIS backup completed successfully: ${BACKUP_TARGET}" >> "${LOG_FILE}"
