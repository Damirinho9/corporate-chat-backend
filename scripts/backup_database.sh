#!/usr/bin/env bash
# Автоматический backup PostgreSQL базы данных
# Использование: ./scripts/backup_database.sh

set -e

# Загрузка переменных окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Настройки
BACKUP_DIR="./backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/corporate_chat_${TIMESTAMP}.sql"
LATEST_LINK="${BACKUP_DIR}/latest.sql"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Starting database backup...${NC}"

# Создаём директорию для бэкапов
mkdir -p "${BACKUP_DIR}"

# Проверяем наличие переменных окружения
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
    echo -e "${RED}❌ Error: DB_HOST, DB_NAME, or DB_USER not set in .env${NC}"
    exit 1
fi

# Выполняем backup
echo -e "${YELLOW}📦 Creating backup: ${BACKUP_FILE}${NC}"

# Используем pg_dump с форматом custom для сжатия
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST:-localhost}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -F c \
    -f "${BACKUP_FILE}.gz" \
    --verbose 2>&1 | grep -v "NOTICE" || true

# Также создаём plain SQL версию для лёгкого просмотра
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST:-localhost}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --clean \
    --if-exists \
    -f "${BACKUP_FILE}" \
    2>&1 | grep -v "NOTICE" || true

# Проверяем успешность
if [ -f "${BACKUP_FILE}" ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"

    # Создаём символическую ссылку на последний бэкап
    ln -sf "$(basename ${BACKUP_FILE})" "${LATEST_LINK}"
    echo -e "${GREEN}🔗 Latest backup link updated${NC}"

    # Удаляем старые бэкапы (старше RETENTION_DAYS дней)
    echo -e "${YELLOW}🧹 Cleaning up old backups (older than ${RETENTION_DAYS} days)...${NC}"
    find "${BACKUP_DIR}" -name "corporate_chat_*.sql" -type f -mtime +${RETENTION_DAYS} -delete
    find "${BACKUP_DIR}" -name "corporate_chat_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

    # Показываем список существующих бэкапов
    echo -e "${GREEN}📋 Available backups:${NC}"
    ls -lh "${BACKUP_DIR}"/corporate_chat_*.sql 2>/dev/null | tail -5 || echo "No backups found"

    echo -e "${GREEN}✅ Backup completed successfully!${NC}"
    exit 0
else
    echo -e "${RED}❌ Error: Backup failed!${NC}"
    exit 1
fi
