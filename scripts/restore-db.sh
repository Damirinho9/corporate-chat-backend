#!/bin/bash
#
# Corporate Chat Database Restore Script
# Восстановление базы данных из бэкапа
#

set -e

# Конфигурация
BACKUP_DIR="/home/damir/corporate-chat-backend/backups"
DB_NAME="corporate_chat"
DB_USER="postgres"
DB_HOST="127.0.0.1"
DB_PORT="5433"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Показать доступные бэкапы
list_backups() {
    echo ""
    echo "📁 Доступные бэкапы:"
    echo ""

    echo "=== Daily (последние 7 дней) ==="
    if [ -d "$BACKUP_DIR/daily" ]; then
        ls -lht "$BACKUP_DIR/daily"/*.sql.gz 2>/dev/null | head -10 | awk '{print NR". "$9" ("$5", "$6" "$7" "$8")"}'
    fi

    echo ""
    echo "=== Weekly (последние 4 недели) ==="
    if [ -d "$BACKUP_DIR/weekly" ]; then
        ls -lht "$BACKUP_DIR/weekly"/*.sql.gz 2>/dev/null | awk '{print NR". "$9" ("$5", "$6" "$7" "$8")"}'
    fi

    echo ""
    echo "=== Monthly (последние 3 месяца) ==="
    if [ -d "$BACKUP_DIR/monthly" ]; then
        ls -lht "$BACKUP_DIR/monthly"/*.sql.gz 2>/dev/null | awk '{print NR". "$9" ("$5", "$6" "$7" "$8")"}'
    fi
    echo ""
}

# Восстановление из бэкапа
restore_from_backup() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "Файл не найден: $backup_file"
        exit 1
    fi

    # Проверяем что файл валидный
    if ! gzip -t "$backup_file" 2>/dev/null; then
        log_error "Файл повреждён: $backup_file"
        exit 1
    fi

    log_info "Файл бэкапа: $backup_file"
    log_info "Размер: $(ls -lh "$backup_file" | awk '{print $5}')"

    echo ""
    log_warn "⚠️  ВНИМАНИЕ: Это полностью заменит текущую базу данных!"
    echo ""
    read -p "Вы уверены? Введите 'YES' для подтверждения: " confirm

    if [ "$confirm" != "YES" ]; then
        log_info "Отменено пользователем"
        exit 0
    fi

    # Создаём бэкап текущего состояния перед восстановлением
    log_info "Создаём бэкап текущего состояния..."
    BEFORE_RESTORE="$BACKUP_DIR/before_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
    pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" | gzip > "$BEFORE_RESTORE"
    log_info "Текущее состояние сохранено: $BEFORE_RESTORE"

    # Останавливаем приложение
    log_info "Останавливаем приложение..."
    pm2 stop corporate-chat 2>/dev/null || true

    # Восстанавливаем базу
    log_info "Восстанавливаем базу данных..."

    # Отключаем все соединения и пересоздаём базу
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres << EOF
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
EOF

    # Загружаем бэкап
    zcat "$backup_file" | psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -q

    log_info "База данных восстановлена!"

    # Запускаем приложение
    log_info "Запускаем приложение..."
    pm2 start corporate-chat

    echo ""
    log_info "✅ Восстановление завершено успешно!"
    log_info "Предыдущее состояние сохранено в: $BEFORE_RESTORE"
    echo ""

    # Показываем статистику
    log_info "Проверка данных:"
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
        SELECT
            (SELECT COUNT(*) FROM users) as users,
            (SELECT COUNT(*) FROM chats) as chats,
            (SELECT COUNT(*) FROM messages) as messages;
    "
}

# Интерактивный выбор бэкапа
interactive_restore() {
    list_backups

    echo "Введите полный путь к файлу бэкапа для восстановления:"
    echo "(или 'q' для выхода)"
    echo ""
    read -p "> " backup_path

    if [ "$backup_path" = "q" ]; then
        exit 0
    fi

    restore_from_backup "$backup_path"
}

# Показать использование
usage() {
    echo "Использование: $0 [опции]"
    echo ""
    echo "Опции:"
    echo "  -l, --list          Показать доступные бэкапы"
    echo "  -r, --restore FILE  Восстановить из указанного файла"
    echo "  -i, --interactive   Интерактивный режим выбора бэкапа"
    echo "  -h, --help          Показать эту справку"
    echo ""
    echo "Примеры:"
    echo "  $0 --list"
    echo "  $0 --restore /home/damir/corporate-chat-backend/backups/daily/backup_20241119_030000.sql.gz"
    echo "  $0 --interactive"
}

# Главная функция
main() {
    case "$1" in
        -l|--list)
            list_backups
            ;;
        -r|--restore)
            if [ -z "$2" ]; then
                log_error "Укажите файл бэкапа"
                usage
                exit 1
            fi
            restore_from_backup "$2"
            ;;
        -i|--interactive)
            interactive_restore
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -n "$1" ] && [ -f "$1" ]; then
                restore_from_backup "$1"
            else
                usage
                exit 1
            fi
            ;;
    esac
}

main "$@"
