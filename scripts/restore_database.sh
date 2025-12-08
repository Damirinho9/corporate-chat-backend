#!/usr/bin/env bash
# Восстановление PostgreSQL базы данных из backup
# Использование: ./scripts/restore_database.sh [backup_file.sql]

set -e

# Загрузка переменных окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Настройки
BACKUP_DIR="./backups"
BACKUP_FILE="${1:-${BACKUP_DIR}/latest.sql}"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  WARNING: This will REPLACE the current database!${NC}"
echo -e "${YELLOW}Backup file: ${BACKUP_FILE}${NC}"
echo -e "${YELLOW}Target database: ${DB_NAME} on ${DB_HOST}${NC}"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo -e "${YELLOW}❌ Restore cancelled${NC}"
    exit 0
fi

# Проверяем наличие файла backup
if [ ! -f "${BACKUP_FILE}" ]; then
    echo -e "${RED}❌ Error: Backup file not found: ${BACKUP_FILE}${NC}"
    echo -e "${YELLOW}Available backups:${NC}"
    ls -lh "${BACKUP_DIR}"/corporate_chat_*.sql 2>/dev/null || echo "No backups found"
    exit 1
fi

# Проверяем переменные окружения
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
    echo -e "${RED}❌ Error: DB_HOST, DB_NAME, or DB_USER not set in .env${NC}"
    exit 1
fi

# Создаём backup текущей базы перед восстановлением
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
PRE_RESTORE_BACKUP="${BACKUP_DIR}/pre_restore_${TIMESTAMP}.sql"

echo -e "${YELLOW}📦 Creating pre-restore backup: ${PRE_RESTORE_BACKUP}${NC}"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST:-localhost}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -f "${PRE_RESTORE_BACKUP}" \
    2>&1 | grep -v "NOTICE" || true

echo -e "${GREEN}✅ Pre-restore backup created${NC}"

# Восстанавливаем базу данных
echo -e "${YELLOW}🔄 Restoring database from ${BACKUP_FILE}...${NC}"

# Проверяем формат файла (custom или plain SQL)
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    # Custom format (compressed)
    PGPASSWORD="${DB_PASSWORD}" pg_restore \
        -h "${DB_HOST:-localhost}" \
        -p "${DB_PORT:-5432}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists \
        -v \
        "${BACKUP_FILE}" 2>&1 | grep -v "NOTICE" || true
else
    # Plain SQL format
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST:-localhost}" \
        -p "${DB_PORT:-5432}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -f "${BACKUP_FILE}" 2>&1 | grep -v "NOTICE" || true
fi

# Проверяем успешность
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database restored successfully!${NC}"
    echo -e "${YELLOW}ℹ️  Pre-restore backup saved at: ${PRE_RESTORE_BACKUP}${NC}"
    exit 0
else
    echo -e "${RED}❌ Error: Restore failed!${NC}"
    echo -e "${YELLOW}💡 You can restore the pre-restore backup: ${PRE_RESTORE_BACKUP}${NC}"
    exit 1
fi
