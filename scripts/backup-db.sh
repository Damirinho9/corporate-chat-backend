#!/bin/bash
#
# Corporate Chat Database Backup System
# Надёжная система бэкапов с верификацией и ротацией
#

set -e

# Конфигурация
BACKUP_DIR="/home/damir/corporate-chat-backend/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
DB_NAME="corporate_chat"
DB_USER="postgres"
DB_HOST="127.0.0.1"
DB_PORT="5433"

# Retention policy (в днях)
KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=3

# Создаём директории
mkdir -p "$BACKUP_DIR/daily"
mkdir -p "$BACKUP_DIR/weekly"
mkdir -p "$BACKUP_DIR/monthly"

# Функция логирования
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Функция проверки бэкапа
verify_backup() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log "ERROR: Backup file not found: $backup_file"
        return 1
    fi

    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)

    if [ "$file_size" -lt 1000 ]; then
        log "ERROR: Backup file too small ($file_size bytes), likely corrupted"
        return 1
    fi

    # Проверяем что архив валидный
    if ! gzip -t "$backup_file" 2>/dev/null; then
        log "ERROR: Backup file is corrupted (gzip test failed)"
        return 1
    fi

    # Проверяем наличие ключевых таблиц в дампе
    if ! zcat "$backup_file" | grep -q "CREATE TABLE.*users"; then
        log "ERROR: Backup doesn't contain users table"
        return 1
    fi

    log "VERIFIED: Backup is valid ($file_size bytes)"
    return 0
}

# Функция очистки старых бэкапов
cleanup_old_backups() {
    local dir="$1"
    local keep_days="$2"
    local type="$3"

    local deleted=$(find "$dir" -name "backup_*.sql.gz" -mtime +$keep_days -delete -print | wc -l)
    if [ "$deleted" -gt 0 ]; then
        log "CLEANUP: Deleted $deleted old $type backups (older than $keep_days days)"
    fi
}

# Основная функция бэкапа
main() {
    log "========== BACKUP STARTED =========="

    # Проверяем доступность базы
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q; then
        log "ERROR: Database is not accessible"
        exit 1
    fi

    DATE=$(date +%Y%m%d_%H%M%S)
    DAY_OF_WEEK=$(date +%u)
    DAY_OF_MONTH=$(date +%d)

    # Создаём daily backup
    DAILY_FILE="$BACKUP_DIR/daily/backup_$DATE.sql.gz"

    log "Creating daily backup..."

    if pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" | gzip > "$DAILY_FILE"; then
        log "SUCCESS: Daily backup created: $DAILY_FILE"
    else
        log "ERROR: pg_dump failed"
        rm -f "$DAILY_FILE"
        exit 1
    fi

    # Верифицируем бэкап
    if ! verify_backup "$DAILY_FILE"; then
        log "ERROR: Backup verification failed!"
        exit 1
    fi

    # Копируем в weekly (каждое воскресенье)
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        WEEKLY_FILE="$BACKUP_DIR/weekly/backup_weekly_$DATE.sql.gz"
        cp "$DAILY_FILE" "$WEEKLY_FILE"
        log "SUCCESS: Weekly backup created: $WEEKLY_FILE"
    fi

    # Копируем в monthly (1-е число месяца)
    if [ "$DAY_OF_MONTH" -eq "01" ]; then
        MONTHLY_FILE="$BACKUP_DIR/monthly/backup_monthly_$DATE.sql.gz"
        cp "$DAILY_FILE" "$MONTHLY_FILE"
        log "SUCCESS: Monthly backup created: $MONTHLY_FILE"
    fi

    # Очистка старых бэкапов
    cleanup_old_backups "$BACKUP_DIR/daily" "$KEEP_DAILY" "daily"
    cleanup_old_backups "$BACKUP_DIR/weekly" "$((KEEP_WEEKLY * 7))" "weekly"
    cleanup_old_backups "$BACKUP_DIR/monthly" "$((KEEP_MONTHLY * 30))" "monthly"

    # Статистика
    TOTAL_DAILY=$(find "$BACKUP_DIR/daily" -name "backup_*.sql.gz" | wc -l)
    TOTAL_WEEKLY=$(find "$BACKUP_DIR/weekly" -name "backup_*.sql.gz" | wc -l)
    TOTAL_MONTHLY=$(find "$BACKUP_DIR/monthly" -name "backup_*.sql.gz" | wc -l)
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

    log "STATS: Daily: $TOTAL_DAILY, Weekly: $TOTAL_WEEKLY, Monthly: $TOTAL_MONTHLY, Total size: $TOTAL_SIZE"
    log "========== BACKUP COMPLETED =========="

    echo ""
    echo "✅ Backup completed successfully!"
    echo "   File: $DAILY_FILE"
    echo "   Size: $(ls -lh "$DAILY_FILE" | awk '{print $5}')"
}

main "$@"
